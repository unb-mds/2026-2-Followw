import pytest

from api.db.models import Course, Curriculum, CurriculumComponent, Subject
from api.sigaa import get_sigaa_public_client

URL = "/public/courses/77/curriculum"


@pytest.fixture
def catalog(client, database):
    def forbidden():
        pytest.fail("A consulta de currículo não deve ir ao SIGAA")

    client.app.dependency_overrides[get_sigaa_public_client] = forbidden
    with database.begin() as session:
        session.add_all(
            [
                Course(
                    id=77, sigaa_id=414924, name="ENGENHARIA DE SOFTWARE", unity_id=673
                ),
                Course(
                    id=78, sigaa_id=414926, name="ENGENHARIA ELETRÔNICA", unity_id=673
                ),
                Course(id=79, name="SEM CURRÍCULO", unity_id=673),
            ]
        )
        session.add_all(
            [
                Subject(
                    code="FGA0001",
                    name="INTRODUÇÃO",
                    hours=60,
                    unity_id=673,
                    prerequisites=[["MAT0001", "MAT0002"], ["MAT0003"]],
                    corequisites=[["FGA0002"]],
                    equivalences=[["CIC0001"]],
                ),
                Subject(code="FGA0002", name="OPTATIVA", hours=30),
            ]
        )
        session.flush()
        matrices = [
            Curriculum(
                course_id=77,
                sigaa_id=101,
                code="ANTIGA",
                valid_from="2022.2",
                created_year=2022,
                active=True,
                shift="D",
                matrix="SOFTWARE - ANTIGA",
            ),
            Curriculum(
                course_id=77,
                sigaa_id=201,
                code="ATUAL",
                valid_from="2024.2",
                created_year=2024,
                active=True,
                shift="D",
                matrix="SOFTWARE - ATUAL",
            ),
            Curriculum(
                course_id=77,
                sigaa_id=301,
                code="FUTURA",
                valid_from="2028.1",
                created_year=2028,
                active=True,
                shift="D",
                matrix="SOFTWARE - FUTURA",
            ),
            Curriculum(
                course_id=77,
                sigaa_id=401,
                code="INATIVA",
                valid_from="2025.1",
                created_year=2025,
                active=False,
                shift="D",
                matrix="SOFTWARE - INATIVA",
            ),
            Curriculum(
                course_id=78,
                sigaa_id=501,
                code="OUTRO",
                valid_from="2024.2",
                created_year=2024,
                active=True,
                shift="N",
                matrix="ELETRÔNICA",
            ),
        ]
        session.add_all(matrices)
        session.flush()
        for matrix in matrices:
            session.add(
                CurriculumComponent(
                    curriculum_id=matrix.id,
                    subject_code="FGA0001",
                    kind="required",
                    period=1,
                )
            )
        selected = matrices[1]
        session.add_all(
            [
                CurriculumComponent(
                    curriculum_id=selected.id,
                    subject_code="SEM_CATALOGO",
                    kind="required",
                    period=3,
                ),
                CurriculumComponent(
                    curriculum_id=selected.id,
                    subject_code="FGA0002",
                    kind="optional",
                    period=0,
                ),
                CurriculumComponent(
                    curriculum_id=selected.id,
                    subject_code="COMPLEMENTAR",
                    kind="complementary",
                    period=None,
                ),
            ]
        )
    return client


def _get(client, entry="2026.1", **params):
    return client.get(URL, params={"entry_semester": entry, **params})


def test_curriculo_por_ingresso_traz_materias_agrupadas_e_requisitos(catalog):
    response = _get(catalog)
    assert response.status_code == 200, response.text
    assert "no-store" in response.headers["cache-control"]
    assert "set-cookie" not in response.headers
    result = response.json()
    assert result == {
        "course_id": 77,
        "sigaa_id": 201,
        "code": "ATUAL",
        "matrix": "SOFTWARE - ATUAL",
        "valid_from": "2024.2",
        "shift": "D",
        "entry_semester": "2026.1",
        "fallback_used": False,
        "periods": [
            {
                "period": 0,
                "subjects": [
                    {
                        "code": "FGA0002",
                        "name": "OPTATIVA",
                        "hours": 30,
                        "unity": None,
                        "prerequisites": None,
                        "corequisites": None,
                        "equivalences": None,
                    }
                ],
            },
            {
                "period": 1,
                "subjects": [
                    {
                        "code": "FGA0001",
                        "name": "INTRODUÇÃO",
                        "hours": 60,
                        "unity": "FCTE",
                        "prerequisites": [["MAT0001", "MAT0002"], ["MAT0003"]],
                        "corequisites": [["FGA0002"]],
                        "equivalences": [["CIC0001"]],
                    }
                ],
            },
            {
                "period": 3,
                "subjects": [
                    {
                        "code": "SEM_CATALOGO",
                        "name": None,
                        "hours": None,
                        "unity": None,
                        "prerequisites": None,
                        "corequisites": None,
                        "equivalences": None,
                    }
                ],
            },
        ],
        "complementary": [
            {
                "code": "COMPLEMENTAR",
                "name": None,
                "hours": None,
                "unity": None,
                "prerequisites": None,
                "corequisites": None,
                "equivalences": None,
            }
        ],
    }


@pytest.mark.parametrize(
    ("entry", "expected", "fallback"),
    [
        ("2021.1", 101, True),
        ("2022.2", 101, False),
        ("2024.1", 101, False),
        ("2024.2", 201, False),
        ("2027.2", 201, False),
        ("2028.1", 301, False),
    ],
)
def test_selecao_por_vigencia_e_fallback_mais_antigo(
    catalog, entry, expected, fallback
):
    response = _get(catalog, entry)
    assert response.status_code == 200
    assert response.json()["sigaa_id"] == expected
    assert response.json()["fallback_used"] is fallback


def _add_tie(database, *, oldest=False):
    with database.begin() as session:
        matrix = Curriculum(
            course_id=77,
            sigaa_id=202,
            code="HABILITAÇÃO",
            valid_from="2022.2" if oldest else "2024.2",
            created_year=2022 if oldest else 2024,
            active=True,
            shift="N",
            matrix="OUTRA HABILITAÇÃO",
        )
        session.add(matrix)
        session.flush()
        session.add(
            CurriculumComponent(
                curriculum_id=matrix.id,
                subject_code="EXCLUSIVA",
                kind="required",
                period=2,
            )
        )


@pytest.mark.parametrize("oldest", [False, True])
def test_empate_retorna_opcoes_e_permite_escolher_matriz(catalog, database, oldest):
    _add_tie(database, oldest=oldest)
    entry = "2021.1" if oldest else "2026.1"
    response = _get(catalog, entry)
    assert response.status_code == 409
    detail = response.json()["detail"]
    assert "curriculum_sigaa_id" in detail["message"]
    assert {item["sigaa_id"] for item in detail["options"]} == {
        101 if oldest else 201,
        202,
    }
    assert next(item for item in detail["options"] if item["sigaa_id"] == 202) == {
        "sigaa_id": 202,
        "code": "HABILITAÇÃO",
        "valid_from": "2022.2" if oldest else "2024.2",
        "matrix": "OUTRA HABILITAÇÃO",
        "shift": "N",
    }
    selected = _get(catalog, entry, curriculum_sigaa_id=202)
    assert selected.status_code == 200
    result = selected.json()
    assert result["sigaa_id"] == 202
    assert result["fallback_used"] is oldest
    assert result["periods"][0] == {"period": 0, "subjects": []}
    assert result["periods"][1]["subjects"][0]["code"] == "EXCLUSIVA"


@pytest.mark.parametrize("wanted", [101, 301, 401, 501, 999])
def test_id_escolhido_deve_pertencer_as_opcoes_do_curso_e_ingresso(catalog, wanted):
    assert _get(catalog, curriculum_sigaa_id=wanted).status_code == 404


@pytest.mark.parametrize("course", [79, 999, 414924])
def test_curso_sem_matriz_ou_inexistente_retorna_404(catalog, course):
    assert (
        catalog.get(
            f"/public/courses/{course}/curriculum", params={"entry_semester": "2026.1"}
        ).status_code
        == 404
    )


@pytest.mark.parametrize(
    "params",
    [
        {},
        {"entry_semester": "2026"},
        {"entry_semester": "2026-1"},
        {"entry_semester": "2026.11"},
        {"entry_semester": "2026.1", "curriculum_sigaa_id": 0},
    ],
)
def test_parametros_invalidos_retorna_422(client, params):
    assert client.get(URL, params=params).status_code == 422


def test_id_local_deve_ser_positivo(client):
    assert (
        client.get(
            "/public/courses/0/curriculum", params={"entry_semester": "2026.1"}
        ).status_code
        == 422
    )


def test_openapi_documenta_selecao_e_conflitos(client):
    schema = client.get("/openapi.json").json()
    path = schema["paths"]["/public/courses/{course_id}/curriculum"]
    assert set(path) == {"get"}
    operation = path["get"]
    assert operation["tags"] == ["Public Courses"]
    assert set(operation["responses"]) == {"200", "404", "409", "422"}
    assert {item["name"] for item in operation["parameters"] if item["required"]} == {
        "course_id",
        "entry_semester",
    }
    assert operation["responses"]["409"]["content"]["application/json"]["schema"][
        "$ref"
    ].endswith("/CurriculumConflict")


def test_post_nao_e_permitido(client):
    response = client.post(URL, params={"entry_semester": "2026.1"})
    assert response.status_code == 405
    assert response.headers["allow"] == "GET"
