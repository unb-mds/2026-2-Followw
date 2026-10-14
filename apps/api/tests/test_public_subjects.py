import pytest

from api.db.models import Classroom, Subject, Unity
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
            "prerequisites": [["FGA0001", "FGA0002"], ["FGA0010"]],
            "corequisites": None,
            "equivalences": [["CIC0004"]],
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
        ("fga0003", []),
        ("inexistente", []),
    ],
)
def test_q_busca_trecho_do_nome_sem_acento_nem_caixa(catalog, q, expected):
    assert [s["code"] for s in _search(catalog, q=q)] == expected


def test_code_e_exato(catalog):
    assert _search(catalog, code="FGA000") == []
    assert [s["code"] for s in _search(catalog, code=" FGA0001 ")] == ["FGA0001"]


@pytest.mark.parametrize("unit", ["518", "ceilandia", " Ceilândia "])
def test_unit_por_id_ou_trecho_do_nome_combina_com_q(catalog, unit):
    assert [s["code"] for s in _search(catalog, unit=unit)] == ["FCE0001"]
    assert _search(catalog, unit=unit, q="compilação") == []


@pytest.mark.parametrize(
    "params,detail",
    [
        ({}, "Informe `q`, `code` ou `unit`."),
        ({"unit": "999"}, "Unidade `999` não encontrada."),
        ({"unit": "reitoria"}, "Nenhuma unidade casa com `reitoria`."),
        ({"unit": "campus unb"}, "`campus unb` casa com 2 unidades"),
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
    }
    assert set(operation["responses"]) == {"200", "422"}
