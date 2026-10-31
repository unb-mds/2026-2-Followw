import pytest

from api.db.models import (
    Classroom,
    Course,
    Curriculum,
    CurriculumComponent,
    Subject,
    Unit,
)
from api.sigaa import get_sigaa_public_client

URL = "/public/courses/77/curriculum"


def test_lista_cursos_com_ids_turnos_e_unidades(client, database):
    def forbidden():
        pytest.fail("A listagem de cursos não deve ir ao SIGAA")

    client.app.dependency_overrides[get_sigaa_public_client] = forbidden
    with database.begin() as session:
        session.add(Unit(id=999, name="UNIDADE SEM SIGLA"))
        session.flush()
        session.add_all(
            [
                Course(
                    id=50, sigaa_id=500, name="TURISMO", shift="INTEGRAL", unit_id=673
                ),
                Course(id=12, name="CRIADO NO SYNC", unit_id=999),
                Course(
                    id=11,
                    sigaa_id=101,
                    name="ADMINISTRAÇÃO",
                    shift="NOTURNO",
                    unit_id=673,
                ),
                Course(
                    id=10,
                    sigaa_id=100,
                    name="ADMINISTRAÇÃO",
                    shift="DIURNO",
                    unit_id=673,
                ),
            ]
        )
    response = client.get("/public/courses")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert "set-cookie" not in response.headers
    assert response.json() == [
        {
            "id": 10,
            "sigaa_id": 100,
            "name": "ADMINISTRAÇÃO",
            "shift": "DIURNO",
            "unit": {"id": 673, "code": "FCTE", "name": "CAMPUS UNB GAMA"},
            "level": "Graduação",
        },
        {
            "id": 11,
            "sigaa_id": 101,
            "name": "ADMINISTRAÇÃO",
            "shift": "NOTURNO",
            "unit": {"id": 673, "code": "FCTE", "name": "CAMPUS UNB GAMA"},
            "level": "Graduação",
        },
        {
            "id": 12,
            "sigaa_id": None,
            "name": "CRIADO NO SYNC",
            "shift": None,
            "unit": {"id": 999, "code": None, "name": "UNIDADE SEM SIGLA"},
            "level": None,
        },
        {
            "id": 50,
            "sigaa_id": 500,
            "name": "TURISMO",
            "shift": "INTEGRAL",
            "unit": {"id": 673, "code": "FCTE", "name": "CAMPUS UNB GAMA"},
            "level": "Graduação",
        },
    ]


def test_lista_vazia_quando_nao_ha_cursos(client):
    response = client.get("/public/courses")
    assert response.status_code == 200
    assert response.json() == []


def test_id_da_listagem_pode_ser_usado_para_consultar_curriculo(catalog):
    response = catalog.get("/public/courses")
    assert response.status_code == 200
    courses = response.json()
    assert [course["id"] for course in courses] == [77, 78, 79]
    selected = next(course for course in courses if course["sigaa_id"] == 414924)
    curriculum = catalog.get(
        f"/public/courses/{selected['id']}/curriculum",
        params={"entry_semester": "2026.1"},
    )
    assert curriculum.status_code == 200
    assert curriculum.json()["course_id"] == selected["id"]


def test_openapi_documenta_listagem_publica_de_cursos(client):
    schema = client.get("/openapi.json").json()
    operation = schema["paths"]["/public/courses"]["get"]
    assert operation["tags"] == ["Public Courses"]
    result = operation["responses"]["200"]["content"]["application/json"]["schema"]
    assert result["type"] == "array"
    assert result["items"]["$ref"].endswith("/PublicCourse")


@pytest.fixture
def catalog(client, database):
    def forbidden():
        pytest.fail("A consulta de currículo não deve ir ao SIGAA")

    client.app.dependency_overrides[get_sigaa_public_client] = forbidden
    with database.begin() as session:
        session.add_all(
            [
                Course(
                    id=77, sigaa_id=414924, name="ENGENHARIA DE SOFTWARE", unit_id=673
                ),
                Course(
                    id=78, sigaa_id=414926, name="ENGENHARIA ELETRÔNICA", unit_id=673
                ),
                Course(id=79, name="SEM CURRÍCULO", unit_id=673),
            ]
        )
        session.add_all(
            [
                Subject(
                    code="FGA0001",
                    name="INTRODUÇÃO",
                    hours=60,
                    unit_id=673,
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
        "degree": None,
        "modality": None,
        "entry_semester": "2026.1",
        "periods": [
            {
                "period": 0,
                "subjects": [
                    {
                        "code": "FGA0002",
                        "name": "OPTATIVA",
                        "hours": 30,
                        "unit": None,
                        "prerequisites": None,
                        "corequisites": None,
                        "equivalences": None,
                        "curriculum_prerequisites": None,
                        "curriculum_corequisites": None,
                        "offered_equivalences": None,
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
                        "unit": {"id": 673, "code": "FCTE", "name": "CAMPUS UNB GAMA"},
                        "prerequisites": [
                            [
                                {"code": "MAT0001", "subject": None},
                                {"code": "MAT0002", "subject": None},
                            ],
                            [{"code": "MAT0003", "subject": None}],
                        ],
                        "corequisites": [
                            [
                                {
                                    "code": "FGA0002",
                                    "subject": {"code": "FGA0002", "name": "OPTATIVA"},
                                }
                            ]
                        ],
                        "equivalences": [[{"code": "CIC0001", "subject": None}]],
                        "curriculum_prerequisites": [],
                        "curriculum_corequisites": [
                            [
                                {
                                    "code": "FGA0002",
                                    "subject": {"code": "FGA0002", "name": "OPTATIVA"},
                                }
                            ]
                        ],
                        "offered_equivalences": [],
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
                        "unit": None,
                        "prerequisites": None,
                        "corequisites": None,
                        "equivalences": None,
                        "curriculum_prerequisites": None,
                        "curriculum_corequisites": None,
                        "offered_equivalences": None,
                    }
                ],
            },
        ],
        "complementary": [
            {
                "code": "COMPLEMENTAR",
                "name": None,
                "hours": None,
                "unit": None,
                "prerequisites": None,
                "corequisites": None,
                "equivalences": None,
                "curriculum_prerequisites": None,
                "curriculum_corequisites": None,
                "offered_equivalences": None,
            }
        ],
    }


def _displayed(client):
    subject = _get(client).json()["periods"][1]["subjects"][0]
    return {
        field: [[item["code"] for item in group] for group in subject[field]]
        for field in ("curriculum_prerequisites", "offered_equivalences")
    }


def test_requisitos_exibidos_preferem_a_matriz_e_depois_os_com_turmas(
    catalog, database
):
    codes = ("MAT0001", "MAT0002", "MAT0003", "CIC0001")
    with database.begin() as session:
        session.add_all(Subject(code=code, name=code) for code in codes)
        session.flush()
        session.add_all(
            [
                Classroom(subject_code="MAT0003", number="01", semester="2026.2"),
                Classroom(subject_code="CIC0001", number="01", semester="2026.2"),
                # só o semestre mais recente conta como oferta
                Classroom(subject_code="MAT0001", number="01", semester="2026.1"),
                Classroom(subject_code="MAT0002", number="01", semester="2026.1"),
            ]
        )
    assert _displayed(catalog) == {
        "curriculum_prerequisites": [["MAT0003"]],
        "offered_equivalences": [["CIC0001"]],
    }

    with database.begin() as session:
        matrix = session.query(Curriculum).filter_by(sigaa_id=201).one()
        session.add_all(
            CurriculumComponent(
                curriculum_id=matrix.id, subject_code=code, kind="optional", period=0
            )
            for code in ("MAT0001", "MAT0002")
        )
    assert _displayed(catalog)["curriculum_prerequisites"] == [["MAT0001", "MAT0002"]]


@pytest.mark.parametrize(
    ("matrix", "degree", "modality"),
    [
        ("TURISMO/CET - Bacharelado - Presencial - D", "Bacharelado", "Presencial"),
        (
            "CONTROLE E AUTOMAÇÃO/FTD - Engenheiro de Controle e Automação - Presencial - D",
            "Engenheiro de Controle e Automação",
            "Presencial",
        ),
        (
            "LETRAS - FRANCÊS - Licenciatura - A Distância - N",
            "Licenciatura",
            "A Distância",
        ),
        ("SOFTWARE - ATUAL", None, None),
    ],
)
def test_grau_e_modalidade_vem_das_partes_da_matriz(
    catalog, database, matrix, degree, modality
):
    with database.begin() as session:
        session.get(Curriculum, _selected_id(session)).matrix = matrix
    result = _get(catalog).json()
    assert (result["degree"], result["modality"]) == (degree, modality)


def _selected_id(session):
    return session.query(Curriculum).filter_by(sigaa_id=201).one().id


@pytest.mark.parametrize(
    ("entry", "expected"),
    [
        ("2021.1", 101),
        ("2022.2", 101),
        ("2024.1", 101),
        ("2024.2", 201),
        ("2027.2", 201),
        ("2028.1", 301),
    ],
)
def test_selecao_pela_maior_vigencia_ate_o_ingresso_ou_a_mais_antiga(
    catalog, entry, expected
):
    response = _get(catalog, entry)
    assert response.status_code == 200
    assert response.json()["sigaa_id"] == expected
    assert "fallback_used" not in response.json()


def test_todo_semestre_tem_curriculo(catalog, database):
    _add_tie(database, code="HABILITAÇÃO/2")
    for year in range(2000, 2031):
        for period in range(10):
            assert _get(catalog, f"{year}.{period}").status_code == 200


def _add_tie(database, *, code, oldest=False):
    with database.begin() as session:
        matrix = Curriculum(
            course_id=77,
            sigaa_id=202,
            code=code,
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


@pytest.mark.parametrize(
    ("code", "oldest", "expected"),
    [
        ("HABILITAÇÃO/2", False, 202),
        ("HABILITAÇÃO/2", True, 202),
        ("HABILITAÇÃO/-2", False, 201),
        ("HABILITAÇÃO/-2", True, 101),
    ],
)
def test_empate_usa_maior_revisao_e_permite_escolher_matriz(
    catalog, database, code, oldest, expected
):
    _add_tie(database, code=code, oldest=oldest)
    entry = "2021.1" if oldest else "2026.1"
    response = _get(catalog, entry)
    assert response.status_code == 200
    assert response.json()["sigaa_id"] == expected
    other = 202 if expected != 202 else (101 if oldest else 201)
    selected = _get(catalog, entry, curriculum_sigaa_id=other)
    assert selected.status_code == 200
    assert selected.json()["sigaa_id"] == other
    exclusive = _get(catalog, entry, curriculum_sigaa_id=202).json()
    assert exclusive["periods"][0] == {"period": 0, "subjects": []}
    assert exclusive["periods"][1]["subjects"][0]["code"] == "EXCLUSIVA"


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


def test_openapi_documenta_selecao(client):
    schema = client.get("/openapi.json").json()
    path = schema["paths"]["/public/courses/{course_id}/curriculum"]
    assert set(path) == {"get"}
    operation = path["get"]
    assert operation["tags"] == ["Public Courses"]
    assert set(operation["responses"]) == {"200", "404", "422"}
    assert {item["name"] for item in operation["parameters"] if item["required"]} == {
        "course_id",
        "entry_semester",
    }


def test_post_nao_e_permitido(client):
    response = client.post(URL, params={"entry_semester": "2026.1"})
    assert response.status_code == 405
    assert response.headers["allow"] == "GET"
