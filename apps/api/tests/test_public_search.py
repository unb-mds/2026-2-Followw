from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest
from sigaa_client import Credentials

from api.db.enums import UserLevel
from api.db.models import (
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
        "courses": result["courses"] and [course["id"] for course in result["courses"]],
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
    assert result["courses"][0]["unit"]["code"] == "FCE"
    assert result["professors"]["total"] == 1
    assert result["professors"]["page"] == 1


def test_cada_termo_precisa_casar(client, catalog):
    assert _summary(_search(client, q="software eng")) == {
        "subjects": [],
        "courses": [2],
        "professors": [],
    }


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


@pytest.mark.parametrize(
    "params",
    [
        {},
        {"q": "ab"},
        {"q": "   "},
        {"q": "a" * 33},
        {"q": "abc\x00"},
        {"q": "matematica", "type": "classrooms"},
        {"q": "matematica", "unit": ""},
        {"q": "matematica", "unit": "XYZ"},
    ],
)
def test_parametros_invalidos_retornam_422(client, catalog, params):
    assert client.get(URL, params=params).status_code == 422


def test_com_login_materias_trazem_o_tipo_da_matriz(
    client, catalog, database, cookies, stub_sigaa
):
    now = datetime.now(UTC)
    with database.begin() as session:
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
        session.add(
            CurriculumComponent(
                curriculum_id=curriculum.id,
                subject_code="MAT0025",
                kind="required",
                period=1,
            )
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

    def kinds():
        result = _search(client, q="matematica", type="subjects")
        return {subject["code"]: subject["kind"] for subject in result["subjects"]}

    assert kinds() == {"MAT0025": None, "MAT0031": None}
    client.cookies.update(
        cookies(refresh=Credentials(registration="251000000", password="senha"))
    )
    assert kinds() == {"MAT0025": "mandatory", "MAT0031": "free"}
    stub_sigaa.profile.get_profile.assert_not_awaited()


def test_openapi_documenta_a_busca(client):
    schema = client.get("/openapi.json").json()
    operation = schema["paths"]["/public/search"]["get"]
    assert operation["tags"] == ["Public Search"]
    params = {param["name"]: param for param in operation["parameters"]}
    assert params["q"]["required"] is True
    assert params["type"]["schema"]["anyOf"][0]["type"] == "array"
