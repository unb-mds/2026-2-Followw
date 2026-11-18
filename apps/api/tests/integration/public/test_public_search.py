from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest
from sigaa_client import Credentials

from api.db.enums import UserLevel
from api.db.models import (
    Classroom,
    Course,
    Curriculum,
    CurriculumComponent,
    Professor,
    Subject,
    Unit,
    User,
)

URL = "/public/search"


@pytest.fixture
def catalog(database):
    with database.begin() as session:
        session.add(Unit(id=518, code="FCE", name="CAMPUS UNB CEILÂNDIA"))
        session.flush()
        session.add_all(
            [
                Subject(code="MAT0025", name="MATEMÁTICA DISCRETA", unit_id=673),
                Subject(code="MAT0031", name="MATEMÁTICA BÁSICA", unit_id=518),
                Subject(code="FGA0001", name="CÁLCULO 1", unit_id=673),
                Course(id=1, sigaa_id=10, name="MATEMÁTICA", unit_id=518),
                Course(id=2, sigaa_id=20, name="ENGENHARIA DE SOFTWARE", unit_id=673),
                Professor(siape=123, name="ANA MATEMÁTICA", unit_id=518),
                Professor(siape=456, name="JOÃO SILVA", unit_id=673),
            ]
        )


def _search(client, **params):
    response = client.get(URL, params=params)
    assert response.status_code == 200, response.text
    return response.json()


def _summary(result):
    return {
        "subjects": result["subjects"]
        and [subject["code"] for subject in result["subjects"]],
        "courses": result["courses"]
        and [course["id"] for course in result["courses"]["items"]],
        "professors": result["professors"]
        and [item["siape"] for item in result["professors"]["items"]],
    }


def test_busca_todos_os_tipos_numa_resposta(client, catalog):
    response = client.get(URL, params={"q": " matematica "})
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    result = response.json()
    assert _summary(result) == {
        "subjects": ["MAT0025", "MAT0031"],
        "courses": [1],
        "professors": [123],
    }
    assert result["courses"]["items"][0]["unit"]["code"] == "FCE"
    assert result["courses"]["total"] == 1
    assert result["professors"]["total"] == 1
    assert result["professors"]["page"] == 1


def test_cada_termo_precisa_casar(client, catalog):
    assert _summary(_search(client, q="software eng")) == {
        "subjects": [],
        "courses": [2],
        "professors": [],
    }


def test_busca_por_inicio_da_aula_exige_os_dias_informados(
    client, catalog, database, subtests
):
    with database.begin() as session:
        session.add_all(
            Classroom(
                subject_code=code, number=number, semester=semester, schedule=schedule
            )
            for code, number, semester, schedule in [
                ("FGA0001", "01", "2026.2", "24M34"),
                ("FGA0001", "02", "2026.2", "2M123"),
                ("FGA0001", "03", "2026.2", "2M34"),
                ("MAT0025", "01", "2026.2", "3M3 2T2"),
                ("MAT0025", "02", "2026.2", "2M4"),
                ("MAT0025", "03", "2026.2", "3M3"),
                ("MAT0025", "04", "2026.2", "246M34"),
                ("MAT0031", "01", "2026.1", "2M3"),
                ("MAT0031", "02", "2026.2", None),
            ]
        )

    for q, expected in [
        ("10", {"FGA0001": ["01", "03"], "MAT0025": ["01", "03", "04"]}),
        ("segunda 10h", {"FGA0001": ["03"]}),
        ("segunda e quarta 10h", {"FGA0001": ["01"]}),
        ("segunda quarta 10h", {"FGA0001": ["01"]}),
        ("quarta, segunda 10:00", {"FGA0001": ["01"]}),
        ("seg, qua e sex 10h", {"MAT0025": ["04"]}),
        ("segunda e terça 10h", {}),
        ("terça-feira 10h", {"MAT0025": ["03"]}),
        ("Seg 10:55", {"MAT0025": ["02"]}),
        ("sábado 10", {}),
    ]:
        with subtests.test(q=q):
            result = _search(client, q=q)
            assert result["courses"] is None
            assert result["professors"] is None
            assert {
                subject["code"]: [
                    classroom["number"] for classroom in subject["classrooms"]
                ]
                for subject in result["subjects"]
            } == expected


def test_busca_por_codigo_sigaa_compara_dias_e_blocos_da_turma(
    client, catalog, database, subtests
):
    with database.begin() as session:
        session.add_all(
            Classroom(
                subject_code=code, number=number, semester="2026.2", schedule=schedule
            )
            for code, number, schedule in [
                ("FGA0001", "01", "24M34"),
                ("FGA0001", "02", "2M34 4M34"),
                ("FGA0001", "03", "246M34"),
                ("FGA0001", "04", "24M3"),
                ("FGA0001", "05", "2M34 4M4"),
                ("MAT0025", "01", "35T34"),
                ("MAT0025", "02", "35T23"),
                ("MAT0031", "01", "35N34"),
            ]
        )

    for q, code, numbers in [
        ("24m34", "FGA0001", ["01", "02"]),
        ("35T34", "MAT0025", ["01"]),
        ("35T23", "MAT0025", ["02"]),
        ("35N34", "MAT0031", ["01"]),
    ]:
        with subtests.test(q=q):
            result = _search(client, q=q)
            assert result["courses"] is None and result["professors"] is None
            assert [subject["code"] for subject in result["subjects"]] == [code]
            assert [
                classroom["number"] for classroom in result["subjects"][0]["classrooms"]
            ] == numbers


def test_type_escolhe_os_tipos_e_os_demais_vem_nulos(client, catalog, monkeypatch):
    professors = AsyncMock(side_effect=AssertionError("Docentes não foram pedidos"))
    monkeypatch.setattr(
        "api.modules.public_professors.service.ProfessorService.list", professors
    )
    result = client.get(
        URL, params=[("q", "matematica"), ("type", "courses"), ("type", "subjects")]
    ).json()
    assert _summary(result) == {
        "subjects": ["MAT0025", "MAT0031"],
        "courses": [1],
        "professors": None,
    }
    professors.assert_not_called()


@pytest.mark.parametrize(
    "unit,expected",
    [
        ("FCE", {"subjects": ["MAT0031"], "courses": [1], "professors": [123]}),
        ("673", {"subjects": ["MAT0025"], "courses": [], "professors": []}),
    ],
)
def test_unit_filtra_todos_os_tipos(client, catalog, unit, expected):
    assert _summary(_search(client, q="matematica", unit=unit)) == expected


def test_parametros_invalidos_retornam_422(client, catalog, subtests):
    for params in [
        {},
        {"q": "ab"},
        {"q": "24"},
        {"q": "   "},
        {"q": "a" * 33},
        {"q": "abc\x00"},
        {"q": "matematica", "type": "classrooms"},
        {"q": "matematica", "unit": ""},
        {"q": "matematica", "unit": "XYZ"},
    ]:
        with subtests.test(params=params):
            assert client.get(URL, params=params).status_code == 422


def test_com_login_busca_prioriza_obrigatorias_e_optativas_da_matriz(
    client, catalog, database, cookies, stub_sigaa
):
    now = datetime.now(UTC)
    with database.begin() as session:
        session.add_all(
            Subject(code=code, name="MATEMÁTICA", unit_id=673)
            for code in ["MAT0002", "MAT0010"]
        )
        session.flush()
        session.add_all(
            Classroom(subject_code=code, number="01", semester="2026.2", schedule="2M3")
            for code in ["MAT0002", "MAT0010", "MAT0025", "MAT0031"]
        )
        curriculum = Curriculum(
            course_id=2,
            sigaa_id=1,
            code="100/1",
            valid_from="2020.1",
            created_year=2000,
            active=True,
            matrix="Fluxo",
        )
        session.add(curriculum)
        session.flush()
        session.add_all(
            [
                CurriculumComponent(
                    curriculum_id=curriculum.id,
                    subject_code="MAT0031",
                    kind="required",
                    period=1,
                ),
                CurriculumComponent(
                    curriculum_id=curriculum.id,
                    subject_code="MAT0025",
                    kind="optional",
                    period=0,
                ),
            ]
        )
        session.add(
            User(
                name="Aluno",
                registration="251000000",
                level=UserLevel.GRADUACAO,
                course_id=2,
                entry_semester="2025.1",
                curriculum_id=curriculum.id,
                profile_synced_at=now,
                classrooms_synced_at=now,
                grades_synced_at=now,
            )
        )

    def kinds(q):
        result = _search(client, q=q, type="subjects")
        return [(subject["code"], subject["kind"]) for subject in result["subjects"]]

    assert kinds("segunda 10") == [
        (code, None) for code in ["MAT0002", "MAT0010", "MAT0025", "MAT0031"]
    ]
    client.cookies.update(
        cookies(refresh=Credentials(registration="251000000", password="senha"))
    )
    for q in ["matematica", "segunda 10"]:
        assert kinds(q) == [
            ("MAT0031", "mandatory"),
            ("MAT0025", "optional"),
            ("MAT0002", "free"),
            ("MAT0010", "free"),
        ]
    with database.begin() as session:
        session.get(Subject, "MAT0025").hours = 60
        session.get(Subject, "MAT0002").hours = 60
        session.add(
            Classroom(
                subject_code="MAT0025",
                number="02",
                semester="2026.2",
                schedule="2M3",
                vacancies=30,
                occupied=30,
            )
        )
        session.add(
            Classroom(
                subject_code="MAT0025", number="03", semester="2026.2", schedule="24M3"
            )
        )
    for params, expected in [
        ({"electives": "true"}, ["MAT0025", "MAT0002", "MAT0010"]),
        (
            {
                "electives": "true",
                "q": "matematica",
                "days": "0",
                "start": "10:00",
                "unit": "673",
                "hours": 60,
            },
            ["MAT0025", "MAT0002"],
        ),
        ({"electives": "true", "days": "02"}, ["MAT0025"]),
    ]:
        response = client.get("/public/subjects", params=params)
        assert response.status_code == 200
        results = response.json()
        assert [s["code"] for s in results] == expected
        assert all(c["number"] != "02" for s in results for c in s["classrooms"])
        if params.get("days") == "0":
            assert all(c["number"] == "01" for s in results for c in s["classrooms"])
    stub_sigaa.profile.get_profile.assert_not_awaited()


def test_openapi_documenta_a_busca(api):
    schema = api.get("/openapi.json").json()
    operation = schema["paths"]["/public/search"]["get"]
    assert operation["tags"] == ["Public Search"]
    params = {param["name"]: param for param in operation["parameters"]}
    assert params["q"]["required"] is True
    assert params["type"]["schema"]["anyOf"][0]["type"] == "array"
