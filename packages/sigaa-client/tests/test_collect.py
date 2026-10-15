import csv
import importlib
from pathlib import Path
from types import SimpleNamespace

import pytest

from sigaa_client import (
    Curriculum,
    CurriculumSummary,
    PublicClassroom,
    SigaaError,
    Subject,
    SubjectDetails,
    Teacher,
    Unit,
)

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
GAMA = Unit(id=673, name="GAMA")
CEILANDIA = Unit(id=518, name="CEILANDIA")


@pytest.fixture
def curricula_script(monkeypatch):
    monkeypatch.syspath_prepend(str(SCRIPTS))
    module = importlib.import_module("collect_curricula")
    monkeypatch.setattr(module, "DELAY", 0)
    monkeypatch.setattr(module, "RETRY_DELAY", 0)
    return module


def test_curriculos_recentes_incluem_base_anterior_e_preservam_turno(curricula_script):
    def item(id, year, active=True, shift="MV"):
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

    class Client(FakeClient):
        curricula = BrokenCurricula()

    monkeypatch.setattr(curricula_script, "SigaaPublicClient", Client)
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
        required_by_period=[
            {"period": 1, "required": ["ADM0023"]},
            {"period": 2, "required": []},
        ],
        optional=["ADM0002"],
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
    assert {(row["subject_code"], row["period"], row["kind"]) for row in rows} == {
        ("ADM0023", "1", "required"),
        ("ADM0002", "0", "optional"),
        ("ADM0100", "", "complementary"),
    }
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
def by_unit(monkeypatch):
    monkeypatch.syspath_prepend(str(SCRIPTS))
    module = importlib.import_module("_by_unit")
    monkeypatch.setattr(module, "SigaaPublicClient", FakeClient)
    monkeypatch.setattr(module, "RETRY_DELAY", 0)
    monkeypatch.setattr(module, "UNIT_DELAY", 0)
    return module


@pytest.fixture
def classrooms_script(by_unit):
    return importlib.import_module("collect_classrooms")


@pytest.fixture
def subjects_script(by_unit, monkeypatch):
    module = importlib.import_module("collect_subjects")
    monkeypatch.setattr(module, "DETAIL_DELAY", 0)
    return module


def _classroom(code: str | None, number: str, **fields) -> PublicClassroom:
    return PublicClassroom(
        number=number,
        semester="2026.2",
        subject=Subject(code=code, name="X"),
        **fields,
    )


async def test_unidade_com_erro_de_rede_e_tentada_de_novo(by_unit):
    calls = []

    async def collect(client, unit):
        calls.append(unit.id)
        if calls.count(unit.id) < by_unit.ATTEMPTS:
            raise SigaaError("instável")
        return [unit.id]

    found = await by_unit.collect_by_unit([GAMA], collect, str, workers=1)

    assert found == {673: [673]}
    assert calls == [673] * by_unit.ATTEMPTS


async def test_unidade_que_sempre_falha_impede_salvar_as_outras(by_unit):
    calls = []

    async def collect(client, unit):
        calls.append(unit.id)
        if unit.id == GAMA.id:
            raise SigaaError("fora do ar")
        return []

    with pytest.raises(RuntimeError, match=r"\[673\]; nada foi salvo"):
        await by_unit.collect_by_unit([GAMA, CEILANDIA], collect, str, workers=2)
    assert calls.count(GAMA.id) == by_unit.ATTEMPTS
    assert calls.count(CEILANDIA.id) == 1


async def test_erro_que_nao_e_de_rede_nao_e_tentado_de_novo(by_unit):
    calls = []

    async def collect(client, unit):
        calls.append(unit.id)
        raise ValueError("bug")

    with pytest.raises(ValueError):
        await by_unit.collect_by_unit([GAMA], collect, str, workers=1)
    assert calls == [673]


def test_semestre_invalido_e_barulhento(by_unit):
    assert by_unit.parse_semester("2026.2") == (2026, 2)
    assert by_unit.parse_semester(None) == (None, None)
    with pytest.raises(ValueError, match="AAAA.P"):
        by_unit.parse_semester("2026-2")


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
                    teachers=(Teacher(name="A", hours=30), Teacher(name="B")),
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
            "teachers": "A; B",
        },
        {
            "subject_code": "FGA0030",
            "number": "01",
            "semester": "2026.2",
            "schedule": "35M12",
            "room": "S3",
            "vacancies": 100,
            "occupied": None,
            "teachers": "",
        },
    ]


def test_csv_de_turmas_escreve_as_colunas_na_ordem_e_vazio_para_nulo(
    classrooms_script, tmp_path
):
    path = tmp_path / "classrooms.csv"
    rows = classrooms_script.classroom_rows([[_classroom("FGA0030", "01", room="S3")]])
    classrooms_script.write_csv(rows, classrooms_script.COLUMNS, path)

    assert path.read_text(encoding="utf-8").splitlines() == [
        ",".join(classrooms_script.COLUMNS),
        "FGA0030,01,2026.2,,S3,,,",
    ]


async def test_nova_tentativa_de_componentes_continua_de_onde_parou(
    subjects_script, monkeypatch
):
    skips = []

    async def iter_subjects(unit, *, skip, **_):
        skips.append(set(skip))
        for code in ("FGA0001", "FGA0002"):
            if code in skip:
                continue
            yield SubjectDetails(code=code, name=code)
            if len(skips) == 1:
                raise SigaaError("caiu no meio")

    async def load_units(only):
        return [GAMA]

    monkeypatch.setattr(subjects_script, "load_units", load_units)
    monkeypatch.setattr(
        FakeClient, "classrooms", SimpleNamespace(iter_subjects=iter_subjects)
    )

    subjects = await subjects_script.collect_subjects(workers=1)

    assert skips == [set(), {"FGA0001"}]
    assert [(unit_id, s.code) for unit_id, s in subjects] == [
        (673, "FGA0001"),
        (673, "FGA0002"),
    ]


def test_csv_de_componentes_tem_a_unidade_e_os_requisitos(subjects_script, tmp_path):
    path = tmp_path / "subjects.csv"
    subject = SubjectDetails(
        code="FGA0002", name="B", hours=60, unity="GAMA", prerequisites="FGA0001"
    )
    subjects_script.write_csv(
        subjects_script.subject_rows([(673, subject)]), subjects_script.COLUMNS, path
    )

    assert path.read_text(encoding="utf-8").splitlines() == [
        ",".join(subjects_script.COLUMNS),
        "FGA0002,B,60,673,FGA0001,,",
    ]
