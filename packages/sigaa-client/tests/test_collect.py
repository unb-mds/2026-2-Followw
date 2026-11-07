import asyncio
import csv
import importlib
from pathlib import Path
from types import SimpleNamespace

import pytest

from sigaa_client import (
    Curriculum,
    CurriculumSummary,
    ProfessorProfile,
    PublicClassroom,
    PublicSubject,
    SigaaError,
    SigaaParseError,
    SigaaSearchError,
    Subject,
    SubjectDetails,
    SubjectSearchResult,
    SubjectType,
    TeachingLevel,
    Unit,
)

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
GAMA = Unit(id=673, name="GAMA")
CEILANDIA = Unit(id=518, name="CEILANDIA")


def test_csv_de_docentes_usa_unidade_e_omite_url(monkeypatch):
    monkeypatch.syspath_prepend(str(SCRIPTS))
    script = importlib.import_module("collect_professors")
    professor = ProfessorProfile(
        siape=123,
        name="MARIA",
        unit=GAMA,
        url="https://sigaa.unb.br/sigaa/public/docente/portal.jsf?siape=123",
    )
    (row,) = script.rows([professor])
    assert row["unit_id"] == 673
    assert "department_id" not in row
    assert "url" not in row


@pytest.fixture
def curricula_script(helpers, monkeypatch):
    module = importlib.import_module("collect_curricula")
    monkeypatch.setattr(module, "DELAY", 0)
    return module


def test_curriculos_recentes_incluem_base_anterior_e_preservam_turno(curricula_script):
    def item(id, year, active=True, shift="D"):
        return CurriculumSummary(
            sigaa_id=id,
            course_sigaa_id=1,
            code=str(id),
            created_year=year,
            active=active,
            shift=shift,
        )

    items = [
        item(1, 2018),
        item(2, 2021),
        item(3, 2023),
        item(4, 2026),
        item(5, 2025, False),
        item(6, 2027),
        item(7, 2020, shift="N"),
        item(8, 2026),
    ]
    assert {x.sigaa_id for x in curricula_script.select_curricula(items, 2026)} == {
        2,
        3,
        4,
        7,
        8,
    }
    assert {
        x.sigaa_id for x in curricula_script.select_curricula(items, 2026, True)
    } == {4, 7, 8}
    assert curricula_script.select_curricula([item(9, 2020, False)], 2026) == []
    assert curricula_script.select_curricula([item(10, 2027)], 2026) == [item(10, 2027)]


def test_falha_na_coleta_de_curriculos_nao_substitui_dataset(
    curricula_script, monkeypatch, tmp_path
):
    class BrokenCurricula:
        async def list_curricula(self, course_id):
            raise SigaaError("indisponível")

    monkeypatch.setattr(FakeClient, "curricula", BrokenCurricula(), raising=False)
    courses = tmp_path / "courses.csv"
    courses.write_text("id,name\n1,Curso\n", encoding="utf-8")
    output = tmp_path / "curricula.csv"
    output.write_text("preservado", encoding="utf-8")
    components = tmp_path / "curriculum_components.csv"
    components.write_text("componentes preservados", encoding="utf-8")
    monkeypatch.setattr(
        "sys.argv",
        [
            "collect_curricula",
            "--courses",
            str(courses),
            "--output-dir",
            str(tmp_path),
            "--year",
            "2026",
        ],
    )
    with pytest.raises(RuntimeError, match="dataset não foi substituído"):
        curricula_script.main()
    assert output.read_text(encoding="utf-8") == "preservado"
    assert components.read_text(encoding="utf-8") == "componentes preservados"


def test_coleta_grava_matrizes_e_componentes_com_optativas_no_periodo_zero(
    curricula_script, tmp_path
):
    item = Curriculum(
        sigaa_id=456,
        course_sigaa_id=414112,
        code="8117/1",
        created_year=2020,
        active=True,
        shift=None,
        valid_from="2020.1",
        matrix='ADMINISTRAÇÃO, "D"',
        total_workload=3000,
        required_workload=1680,
        optional_min_workload=1320,
        complementary_min_workload=0,
        elective_max_workload=360,
        period_max_workload=420,
        period_min_workload=210,
        min_semesters=8,
        avg_semesters=9,
        max_semesters=16,
        required_by_period=[
            {"period": 1, "required": ["ADM0023", "ADM0024"]},
            {"period": 2, "required": []},
        ],
        optional=["ADM0002", "ADM0003"],
        complementary=["ADM0100"],
    )
    curricula_script.write_csvs([item], tmp_path)
    with (tmp_path / "curricula.csv").open(encoding="utf-8", newline="") as file:
        (matrix,) = list(csv.DictReader(file))
    with (tmp_path / "curriculum_components.csv").open(
        encoding="utf-8", newline=""
    ) as file:
        rows = list(csv.DictReader(file))
    assert matrix["matrix"] == item.matrix
    assert matrix["shift"] == ""
    assert matrix["active"] == "true"
    assert (matrix["total_workload"], matrix["min_semesters"]) == ("3000", "8")
    assert {(row["subject_codes"], row["period"], row["kind"]) for row in rows} == {
        ("ADM0023 ADM0024", "1", "required"),
        ("", "2", "required"),
        ("ADM0002 ADM0003", "0", "optional"),
        ("ADM0100", "", "complementary"),
    }
    assert len({row["period"] for row in rows}) == len(rows)
    assert all(
        row["curriculum_sigaa_id"] == "456" and row["course_sigaa_id"] == "414112"
        for row in rows
    )


class FakeClient:
    """Sessão pública de mentira; o teste põe o resource que precisar."""

    classrooms = None

    def __init__(self, **_):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        pass


@pytest.fixture
def helpers(monkeypatch):
    monkeypatch.syspath_prepend(str(SCRIPTS))
    module = importlib.import_module("_collect")
    monkeypatch.setattr(module, "SigaaPublicClient", FakeClient)
    monkeypatch.setattr(module, "RETRY_DELAY", 0)
    monkeypatch.setattr(module, "UNIT_DELAY", 0)
    return module


async def test_docentes_filtram_os_departamentos_da_busca_de_docentes(
    helpers, monkeypatch
):
    script = importlib.import_module("collect_professors")
    searched = []

    async def list_units():
        return [GAMA, CEILANDIA]

    async def search(unit):
        searched.append(unit.id)
        return []

    monkeypatch.setattr(
        FakeClient,
        "professors",
        SimpleNamespace(list_units=list_units, search=search),
        raising=False,
    )

    with pytest.raises(RuntimeError, match="Nenhum docente"):
        await script.collect_professors(["gama"], workers=1)
    assert searched == [673]
    with pytest.raises(RuntimeError, match="Nenhuma unidade casa"):
        await script.collect_professors(["xyz"], workers=1)


@pytest.fixture
def classrooms_script(helpers):
    return importlib.import_module("collect_classrooms")


@pytest.fixture
def subjects_script(helpers, monkeypatch):
    module = importlib.import_module("collect_subjects")
    monkeypatch.setattr(module, "DELAY", 0)
    return module


def _classroom(code: str | None, number: str, **fields) -> PublicClassroom:
    return PublicClassroom(
        number=number,
        semester="2026.2",
        subject=Subject(code=code, name="X"),
        **fields,
    )


async def test_unidade_com_erro_de_rede_e_tentada_de_novo(helpers):
    calls = []

    async def collect(client, unit):
        calls.append(unit.id)
        if calls.count(unit.id) < helpers.ATTEMPTS:
            raise SigaaError("instável")
        return [unit.id]

    found = await helpers.collect_by_unit([GAMA], collect, str, workers=1)

    assert found == {673: [673]}
    assert calls == [673] * helpers.ATTEMPTS


async def test_unidade_que_sempre_falha_impede_salvar_as_outras(helpers):
    calls = []

    async def collect(client, unit):
        calls.append(unit.id)
        if unit.id == GAMA.id:
            raise SigaaError("fora do ar")
        return []

    with pytest.raises(RuntimeError, match=r"\[673\]; nada foi salvo"):
        await helpers.collect_by_unit([GAMA, CEILANDIA], collect, str, workers=2)
    assert calls.count(GAMA.id) == helpers.ATTEMPTS
    assert calls.count(CEILANDIA.id) == 1


async def test_erro_que_nao_e_de_rede_nao_e_tentado_de_novo(helpers):
    calls = []

    async def collect(client, unit):
        calls.append(unit.id)
        raise ValueError("bug")

    with pytest.raises(ValueError):
        await helpers.collect_by_unit([GAMA], collect, str, workers=1)
    assert calls == [673]


def test_semestre_invalido_e_barulhento(helpers):
    assert helpers.parse_semester("2026.2") == (2026, 2)
    assert helpers.parse_semester(None) == (None, None)
    with pytest.raises(ValueError, match="AAAA.P"):
        helpers.parse_semester("2026-2")


def test_uma_turma_por_linha_ainda_que_apareca_em_mais_de_uma_unidade(
    classrooms_script,
):
    shared = _classroom("FGA0030", "01", schedule="35M12", room="S3", vacancies=100)
    rows = classrooms_script.classroom_rows(
        [
            [
                shared,
                _classroom(
                    "FGA0001",
                    "02",
                    occupied=10,
                    professors=("A", "B"),
                ),
            ],
            [shared, _classroom(None, "01")],
        ]
    )

    assert rows == [
        {
            "subject_code": "FGA0001",
            "number": "02",
            "semester": "2026.2",
            "schedule": None,
            "room": None,
            "vacancies": None,
            "occupied": 10,
            "professors": "A; B",
        },
        {
            "subject_code": "FGA0030",
            "number": "01",
            "semester": "2026.2",
            "schedule": "35M12",
            "room": "S3",
            "vacancies": 100,
            "occupied": None,
            "professors": "",
        },
    ]


def test_csv_de_turmas_escreve_as_colunas_na_ordem_e_vazio_para_nulo(
    classrooms_script, tmp_path
):
    path = tmp_path / "classrooms.csv"
    rows = classrooms_script.classroom_rows([[_classroom("FGA0030", "01", room="S3")]])
    classrooms_script.write_csv((path, classrooms_script.COLUMNS, rows))

    assert path.read_text(encoding="utf-8").splitlines() == [
        ",".join(classrooms_script.COLUMNS),
        "FGA0030,01,2026.2,,S3,,,",
    ]


async def test_pool_devolve_na_ordem_dos_itens_com_uma_sessao_por_worker(
    helpers, monkeypatch
):
    sessions = []

    class Client(FakeClient):
        def __init__(self, **_):
            sessions.append(self)

    monkeypatch.setattr(helpers, "SigaaPublicClient", Client)

    async def work(client, item):
        await asyncio.sleep(0.01 if item == 1 else 0)
        return (item, client)

    found = await helpers.run_pool([1, 2, 3], work, workers=2)

    assert [item for item, _ in found] == [1, 2, 3]
    assert {client for _, client in found} == set(sessions)
    assert len(sessions) == 2
    assert await helpers.run_pool([], work) == []


async def test_recusa_da_busca_nao_e_tentada_de_novo(helpers):
    calls = []

    async def step():
        calls.append(1)
        raise SigaaSearchError("sem detalhes")

    with pytest.raises(SigaaSearchError):
        await helpers.with_retries(step, "X")
    assert len(calls) == 1


def test_csvs_so_sao_trocados_quando_todos_foram_escritos(helpers, tmp_path):
    first, second = tmp_path / "a.csv", tmp_path / "b.csv"
    first.write_text("antigo a", encoding="utf-8")
    second.write_text("antigo b", encoding="utf-8")

    with pytest.raises(KeyError):
        helpers.write_csv((first, ("x",), [{"x": 1}]), (second, ("y",), [{"outra": 2}]))
    assert first.read_text(encoding="utf-8") == "antigo a"
    assert second.read_text(encoding="utf-8") == "antigo b"
    assert sorted(path.name for path in tmp_path.iterdir()) == ["a.csv", "b.csv"]

    helpers.write_csv((first, ("x",), [{"x": 1, "extra": 0}]))
    assert first.read_text(encoding="utf-8").splitlines() == ["x", "1"]


def _catalog_subject(code, name="X"):
    return PublicSubject(
        code=code,
        name=name,
        sigaa_id=int(code[-4:]) + 1,
        level=TeachingLevel.GRADUACAO,
        type=SubjectType.DISCIPLINA,
    )


class FakeSubjects:
    """Catálogo e matrizes de mentira: `catalog` sai na busca, `matrices` só pelo link."""

    def __init__(self, catalog=(), matrices=None, requirements=None, truncated=()):
        self.catalog = {code: _catalog_subject(code) for code in catalog}
        self.matrices = matrices or {}
        self.requirements = requirements or {}
        self.truncated = set(truncated)
        self.searches = []
        self.matrix_calls = []

    def _details(self, code):
        return SubjectDetails(
            code=code,
            name=f"NOME {code}",
            hours=60,
            unit="DEPTO CIÊNCIAS DA COMPUTAÇÃO - BRASÍLIA",
            **self.requirements.get(code, {}),
        )

    async def search(self, *, code):
        self.searches.append(code)
        items = tuple(s for c, s in self.catalog.items() if c.startswith(code))
        if code in self.truncated:
            return SubjectSearchResult(items=items[:1], truncated=True)
        return SubjectSearchResult(items=items)

    async def get_details(self, subject):
        return self._details(subject.code)

    async def get_subject_details(self, course, curriculum, code):
        self.matrix_calls.append((course, curriculum, code))
        if (course, curriculum) not in self.matrices.get(code, ()):
            raise SigaaSearchError("Componente sem link nesta matriz")
        return self._details(code)


@pytest.fixture
def subjects(monkeypatch):
    def install(fake):
        monkeypatch.setattr(FakeClient, "subjects", fake, raising=False)
        monkeypatch.setattr(FakeClient, "curricula", fake, raising=False)
        return fake

    return install


UNIT_IDS = {"depto ciencias da computacao - brasilia": 508}


async def test_resolve_pelo_catalogo_e_segue_os_requisitos_dos_acrescentados(
    subjects_script, subjects
):
    fake = subjects(
        FakeSubjects(
            catalog=["CIC0004", "CIC0005", "MAT0025", "MAT0026"],
            requirements={
                "CIC0004": {"prerequisites": "( MAT0025 )"},
                "MAT0025": {"equivalences": "( CIC0005 )"},
            },
        )
    )
    kept = {"code": "FGA0001", "name": "BASE", "unit_id": "673"}

    rows = await subjects_script.resolve([kept], {"CIC0004"}, {}, UNIT_IDS)

    assert [row["code"] for row in rows] == ["CIC0004", "CIC0005", "FGA0001", "MAT0025"]
    assert fake.searches == ["CIC", "MAT", "CIC"]
    assert rows[0] == {
        "code": "CIC0004",
        "name": "NOME CIC0004",
        "hours": 60,
        "unit_id": 508,
        "prerequisites": "( MAT0025 )",
        "corequisites": None,
        "equivalences": None,
    }
    assert rows[2] is kept


async def test_catalogo_truncado_busca_os_codigos_que_faltam_exatamente(
    subjects_script, subjects
):
    fake = subjects(FakeSubjects(catalog=["IQD0051", "IQD0052"], truncated={"IQD"}))

    rows = await subjects_script.resolve([], {"IQD0051", "IQD0052"}, {}, {})

    assert fake.searches == ["IQD", "IQD0052"]
    assert [(row["code"], row["unit_id"]) for row in rows] == [
        ("IQD0051", None),
        ("IQD0052", None),
    ]


async def test_inativo_vem_da_primeira_matriz_com_o_link(subjects_script, subjects):
    fake = subjects(
        FakeSubjects(
            matrices={"MAT0024": [(414321, 184)]},
            requirements={"MAT0024": {"equivalences": "( MAT0025 )"}},
        )
    )
    sources = {"MAT0024": [(1, 2), (414321, 184)], "EPR0141": [(3, 4)]}

    rows = await subjects_script.resolve([], {"MAT0024", "EPR0141"}, sources, {})

    assert [row["code"] for row in rows] == ["MAT0024"]
    assert fake.matrix_calls == [
        (3, 4, "EPR0141"),
        (1, 2, "MAT0024"),
        (414321, 184, "MAT0024"),
    ]
    # A equivalência citada pelo inativo também é procurada, na segunda volta.
    assert fake.searches == ["EPR", "MAT", "MAT"]


async def test_codigo_sem_origem_nao_ganha_linha_inventada(subjects_script, subjects):
    subjects(FakeSubjects())
    rows = [{"code": "FGA0001", "name": "BASE"}]

    assert await subjects_script.resolve(rows, {"IQD0051"}, {}, {}) == rows


async def test_linhas_gravadas_nao_abrem_sessao_nem_seguem_seus_requisitos(
    subjects_script, helpers, monkeypatch
):
    def forbidden(**_):
        pytest.fail("Sem --refresh, só o que os outros CSVs pedem é buscado")

    monkeypatch.setattr(helpers, "SigaaPublicClient", forbidden)
    rows = [{"code": "FGA0001", "name": "BASE", "prerequisites": "( IQD0051 )"}]

    assert await subjects_script.resolve(rows, {"FGA0001"}, {}, {}) == rows


async def test_refresh_coleta_de_novo_e_mantem_a_linha_de_quem_sumiu(
    subjects_script, subjects
):
    fake = subjects(
        FakeSubjects(
            catalog=["FGA0001", "IQD0051"],
            requirements={"FGA0001": {"prerequisites": "( IQD0051 )"}},
        )
    )
    old = {"code": "FGA0001", "name": "ANTIGO"}
    gone = {"code": "OLD0001", "name": "SUMIU DO SIGAA"}

    rows = await subjects_script.resolve([old, gone], (), {}, {}, refresh=True)

    assert [row["name"] for row in rows] == [
        "NOME FGA0001",
        "NOME IQD0051",
        gone["name"],
    ]
    assert rows[2] is gone
    assert fake.searches == ["FGA", "OLD", "IQD"]


async def test_falha_de_um_componente_nao_derruba_a_coleta(
    subjects_script, subjects, capsys
):
    fake = subjects(FakeSubjects(catalog=["CIC0004", "IQD0051", "IQD0052"]))
    search, get_details = fake.search, fake.get_details

    async def flaky_search(*, code):
        if code == "MAT":
            raise SigaaError("indisponível")
        return await search(code=code)

    async def flaky_details(subject):
        if subject.code == "IQD0052":
            raise SigaaParseError("tela estranha")
        return await get_details(subject)

    fake.search, fake.get_details = flaky_search, flaky_details
    old = {"code": "MAT0024", "name": "ANTIGA"}
    wanted = {"CIC0004", "IQD0051", "IQD0052", "MAT0024"}

    rows = await subjects_script.resolve([old], wanted, {}, {}, refresh=True)

    assert [row["code"] for row in rows] == ["CIC0004", "IQD0051", "MAT0024"]
    assert rows[2] is old
    assert "Falhas (2), tente de novo: IQD0052, MAT0024" in capsys.readouterr().out


def test_lista_longa_de_codigos_e_resumida(subjects_script):
    codes = [f"X{index:04}" for index in range(subjects_script.SAMPLE + 5)]
    assert subjects_script._sample(codes).endswith("X0019 e mais 5")
