import pytest

from api.db.models import Classroom, Subject, Unity
from api.db.seed.subjects import read_subjects
from api.sigaa import get_sigaa_public_client


@pytest.fixture
def catalog(client, database):
    def forbidden():
        pytest.fail("A busca de componentes não deve ir ao SIGAA")

    client.app.dependency_overrides[get_sigaa_public_client] = forbidden
    with database.begin() as session:
        session.add(Unity(id=518, code="FCE", name="CAMPUS UNB CEILÂNDIA"))
        session.add_all(
            [
                Subject(
                    code="FGA0003",
                    name="COMPILAÇÃO DE PROGRAMAS",
                    hours=60,
                    unity_id=673,
                    prerequisites=[["FGA0001", "FGA0002"], ["FGA0010"]],
                    equivalences=[["CIC0004"]],
                ),
                Subject(code="FGA0001", name="CÁLCULO 1", hours=90, unity_id=673),
                Subject(code="FCE0001", name="CÁLCULO APLICADO", unity_id=518),
                Subject(code="XYZ0001", name="SEM UNIDADE"),
            ]
        )
        session.add_all(
            [
                Classroom(subject_code="FGA0003", number="02", semester="2026.2"),
                Classroom(
                    subject_code="FGA0003",
                    number="01",
                    semester="2026.2",
                    sigaa_id=10,
                    schedule="35M12",
                    room="S3",
                    professors=["FULANO", "CICLANO"],
                    vacancies=50,
                    occupied=48,
                ),
                Classroom(subject_code="FGA0003", number="01", semester="2026.1"),
                Classroom(subject_code="FGA0001", number="01", semester="2026.1"),
            ]
        )
    return client


def _search(client, **params):
    response = client.get("/public/subjects", params=params)
    assert response.status_code == 200, response.text
    return response.json()


def test_componente_traz_as_turmas_do_semestre_mais_recente(catalog):
    response = catalog.get("/public/subjects", params={"code": "fga0003"})

    assert response.status_code == 200
    assert "no-store" in response.headers["cache-control"]
    assert response.json() == [
        {
            "code": "FGA0003",
            "name": "COMPILAÇÃO DE PROGRAMAS",
            "hours": 60,
            "unity": "FCTE",
            "prerequisites": [
                [
                    {
                        "code": "FGA0001",
                        "subject": {"code": "FGA0001", "name": "CÁLCULO 1"},
                    },
                    {"code": "FGA0002", "subject": None},
                ],
                [{"code": "FGA0010", "subject": None}],
            ],
            "corequisites": None,
            "equivalences": [[{"code": "CIC0004", "subject": None}]],
            "unity_name": "CAMPUS UNB GAMA",
            "classrooms": [
                {
                    "sigaa_id": 10,
                    "number": "01",
                    "semester": "2026.2",
                    "schedule": "35M12",
                    "room": "S3",
                    "professors": ["FULANO", "CICLANO"],
                    "vacancies": 50,
                    "occupied": 48,
                },
                {
                    "sigaa_id": None,
                    "number": "02",
                    "semester": "2026.2",
                    "schedule": None,
                    "room": None,
                    "professors": [],
                    "vacancies": None,
                    "occupied": None,
                },
            ],
            "kind": None,
            "recommendation": None,
        }
    ]


def test_semester_escolhe_as_turmas_e_componente_sem_oferta_vem_vazio(catalog):
    result = _search(catalog, unit="673", semester="2026.1")

    assert [(s["code"], [c["number"] for c in s["classrooms"]]) for s in result] == [
        ("FGA0001", ["01"]),
        ("FGA0003", ["01"]),
    ]
    assert _search(catalog, code="FCE0001")[0]["classrooms"] == []


@pytest.mark.parametrize(
    "q,expected",
    [
        ("  calculo   1 ", ["FGA0001"]),
        ("CÁLCULO", ["FCE0001", "FGA0001"]),
        ("fga0003", ["FGA0003"]),
        ("fga", ["FGA0001", "FGA0003"]),
        ("FULANO", ["FGA0003"]),
        ("ano", ["FGA0003"]),
        ("inexistente", []),
    ],
)
def test_q_busca_codigo_nome_e_docente_sem_acento_nem_caixa(catalog, q, expected):
    assert [s["code"] for s in _search(catalog, q=q)] == expected


def test_code_e_exato(catalog):
    assert _search(catalog, code="FGA000") == []
    assert [s["code"] for s in _search(catalog, code=" FGA0001 ")] == ["FGA0001"]


@pytest.mark.parametrize("unit", ["518", "FCE", " fce "])
def test_unit_por_id_ou_codigo_combina_com_q(catalog, unit):
    assert [s["code"] for s in _search(catalog, unit=unit)] == ["FCE0001"]
    assert _search(catalog, unit=unit, q="compilação") == []


@pytest.mark.parametrize(
    "params,detail",
    [
        ({}, "Informe `q`, `code` ou `unit`."),
        ({"unit": "999"}, "Unidade `999` não encontrada."),
        ({"unit": "ceilandia"}, "Unidade `ceilandia` não encontrada."),
        ({"unit": "FC"}, "Unidade `FC` não encontrada."),
    ],
)
def test_filtros_invalidos_sao_422(catalog, params, detail):
    response = catalog.get("/public/subjects", params=params)
    assert response.status_code == 422
    assert detail in response.json()["detail"]


@pytest.mark.parametrize(
    "params",
    [{"q": " "}, {"code": "0003"}, {"unit": ""}, {"semester": "2026-2"}],
)
def test_validacao_de_parametros(catalog, params):
    assert catalog.get("/public/subjects", params=params).status_code == 422


@pytest.mark.parametrize("q", ["", "a", "ab", "a" * 25, " a ", "   "])
def test_q_invalida_nao_consulta_o_catalogo(catalog, monkeypatch, q):
    from unittest.mock import AsyncMock

    search = AsyncMock(side_effect=AssertionError("Query inválida consultou o banco"))
    monkeypatch.setattr(
        "api.modules.public_subjects.repository.SubjectCatalogRepository.list_subjects",
        search,
    )
    assert catalog.get("/public/subjects", params={"q": q}).status_code == 422
    search.assert_not_called()


@pytest.mark.parametrize("length", [3, 24])
def test_q_aceita_os_limites(catalog, database, length):
    q = "x" * length
    with database.begin() as session:
        session.add(Subject(code="TEST0001", name=q))
    assert [s["code"] for s in _search(catalog, q=q)] == ["TEST0001"]


def test_docentes_respeitam_semestre_e_unidade_sem_duplicar(catalog, database):
    with database.begin() as session:
        classrooms = session.query(Classroom).filter_by(subject_code="FGA0003").all()
        for classroom in classrooms:
            classroom.professors = (
                ["Cárlos Silva", "Carlos Sousa"]
                if classroom.semester == "2026.2"
                else ["Docente Antigo"]
            )

    for q in ["  carlos   silva ", "Carlos"]:
        assert [s["code"] for s in _search(catalog, q=q)] == ["FGA0003"]
    assert _search(catalog, q="Professor Inexistente") == []
    assert _search(catalog, q="Carlos", unit="FCE") == []
    assert _search(catalog, q="Carlos", semester="2026.1") == []
    assert _search(catalog, q="Docente Antigo") == []
    assert [
        s["code"] for s in _search(catalog, q="Docente Antigo", semester="2026.1")
    ] == ["FGA0003"]


@pytest.mark.parametrize("field", ["prerequisites", "corequisites", "equivalences"])
def test_requisitos_resolvem_nomes_sem_perder_codigos_ou_grupos(
    catalog, database, field
):
    with database.begin() as session:
        setattr(
            session.get(Subject, "FGA0003"),
            field,
            [["FCE0001", "AUSENTE"], ["FGA0001"]],
        )

    requirements = _search(catalog, code="FGA0003")[0][field]
    assert requirements == [
        [
            {
                "code": "FCE0001",
                "subject": {"code": "FCE0001", "name": "CÁLCULO APLICADO"},
            },
            {"code": "AUSENTE", "subject": None},
        ],
        [{"code": "FGA0001", "subject": {"code": "FGA0001", "name": "CÁLCULO 1"}}],
    ]


@pytest.mark.parametrize("field", ["prerequisites", "corequisites", "equivalences"])
@pytest.mark.parametrize(
    ("code", "name"),
    [
        ("IQD0051", "QUÍMICA GERAL"),
        ("FGA0138", "MÉTODOS DE DESENVOLVIMENTO DE SOFTWARE"),
    ],
)
def test_referencia_sem_oferta_resolve_nome_acrescentado_pela_coleta(
    catalog, database, field, code, name
):
    referenced = next(subject for subject in read_subjects() if subject.code == code)
    with database.begin() as session:
        session.add(referenced)
        setattr(session.get(Subject, "FGA0003"), field, [[code]])

    result = _search(catalog, code="FGA0003")[0][field]
    assert result == [[{"code": code, "subject": {"code": code, "name": name}}]]


def test_sem_turmas_gravadas_os_componentes_vem_sem_turmas(client, database):
    with database.begin() as session:
        session.add(Subject(code="FGA0003", name="COMPILAÇÃO", unity_id=673))

    assert _search(client, q="compilacao")[0]["classrooms"] == []


def test_openapi_so_tem_os_filtros_do_banco(client):
    schema = client.get("/openapi.json").json()
    operation = schema["paths"]["/public/subjects"]["get"]
    assert {item["name"] for item in operation["parameters"]} == {
        "q",
        "code",
        "unit",
        "semester",
        "Cache-Control",
    }
    assert set(operation["responses"]) == {"200", "401", "422", "502", "503"}
