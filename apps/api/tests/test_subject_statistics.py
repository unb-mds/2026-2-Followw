from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sigaa_client import StudentSituation

from api.db.main import get_database
from api.db.models import Classroom, ClassroomProfessor, Professor, Subject
from api.modules.public_subjects import statistics
from api.modules.public_subjects.router import router


def _link(session, classroom, *professors):
    session.flush()
    session.add_all(
        ClassroomProfessor(classroom_id=classroom.id, professor_id=professor.id)
        for professor in professors
    )


def _shares(approved):
    return [
        {"situation": "aprovado", "percentage": approved},
        {"situation": "reprovado", "percentage": 100 - approved},
    ]


@pytest.fixture
def statistics_client(monkeypatch):
    repository = SimpleNamespace(
        classroom_professors=AsyncMock(return_value=["Ana", "João"]),
        historical_statistics=AsyncMock(return_value=[]),
    )
    monkeypatch.setattr(
        statistics, "SubjectCatalogRepository", lambda session: repository
    )

    class Database:
        async def read(self, load):
            return await load(None)

    app = FastAPI()
    app.include_router(router, prefix="/public/subjects")
    app.dependency_overrides[get_database] = Database
    with TestClient(app) as client:
        yield client, repository


def _get(client, **params):
    return client.get(
        "/public/subjects/FGA0003/statistics",
        params={"semester": "2026.2", "number": "01", **params},
    )


def test_media_geral_da_peso_igual_as_turmas_e_preserva_situacoes(statistics_client):
    client, repository = statistics_client
    repository.historical_statistics.return_value = [
        ("2026.1", ["João", "Ana"], _shares(90)),
        ("2026.1", ["Ana", "João"], [{"situation": "aprovado", "percentage": 100}]),
        ("2025.2", ["Ana", "João"], _shares(20)),
        ("2025.2", ["Ana"], _shares(0)),
        ("2025.2", ["Ana", "João", "Outro"], _shares(0)),
        ("2025.1", ["Ana", "João"], None),
        ("2025.1", ["Ana", "João"], []),
    ]
    response = _get(client)
    assert response.status_code == 200
    assert "no-store" in response.headers["cache-control"]
    result = response.json()
    assert result["overall"] == {
        "semester": None,
        "classrooms": 3,
        "shares": _shares(70),
    }
    assert result["semesters"] == [
        {"semester": "2026.1", "classrooms": 2, "shares": _shares(95)},
        {"semester": "2025.2", "classrooms": 1, "shares": _shares(20)},
    ]
    repository.classroom_professors.assert_awaited_once_with("FGA0003", "2026.2", "01")
    repository.historical_statistics.assert_awaited_once_with("FGA0003", "2026.2")


@pytest.mark.parametrize("professors", [[], ["Ana"], ["Ana", "João"]])
def test_sem_historico_compativel_retorna_estatisticas_vazias(
    statistics_client, professors
):
    client, repository = statistics_client
    repository.classroom_professors.return_value = professors
    repository.historical_statistics.return_value = [
        ("2026.1", ["Outro"], _shares(100))
    ]
    assert _get(client).json() == {
        "overall": {"semester": None, "classrooms": 0, "shares": []},
        "semesters": [],
    }


def test_turma_individual_nao_usa_historico_compartilhado(statistics_client):
    client, repository = statistics_client
    repository.classroom_professors.return_value = ["Ana"]
    repository.historical_statistics.return_value = [
        ("2026.1", ["Ana", "João"], _shares(0)),
        ("2025.2", ["Ana"], _shares(80)),
    ]
    assert _get(client).json()["overall"]["shares"] == _shares(80)


def test_preserva_todas_as_situacoes_do_sigaa(statistics_client):
    client, repository = statistics_client
    shares = [
        {"situation": situation.value, "percentage": 11.1}
        for situation in StudentSituation
    ]
    repository.historical_statistics.return_value = [
        ("2026.1", ["Ana", "João"], shares)
    ]
    assert _get(client).json()["overall"]["shares"] == shares


def test_turma_inexistente_retorna_404(statistics_client):
    client, repository = statistics_client
    repository.classroom_professors.return_value = None
    assert _get(client).status_code == 404


@pytest.mark.parametrize("params", [{"semester": "invalido"}, {"number": ""}])
def test_parametros_invalidos_nao_consultam_o_banco(statistics_client, params):
    client, repository = statistics_client
    assert _get(client, **params).status_code == 422
    repository.classroom_professors.assert_not_awaited()


def test_consulta_real_exclui_outros_componentes_e_semestres_atuais_e_futuros(
    client, database
):
    with database.begin() as session:
        session.add_all(
            [
                Subject(code="FGA0003", name="Matéria"),
                Subject(code="FGA0004", name="Outra"),
            ]
        )
        ana = Professor(name="Ana")
        classrooms = [
            Classroom(subject_code=code, semester=semester, number="01", statistics=s)
            for code, semester, s in [
                ("FGA0003", "2026.2", _shares(0)),
                ("FGA0003", "2027.1", _shares(0)),
                ("FGA0004", "2026.1", _shares(0)),
                ("FGA0003", "2026.1", _shares(80)),
            ]
        ]
        session.add_all([ana, *classrooms])
        for classroom in classrooms:
            _link(session, classroom, ana)
    result = _get(client).json()
    assert result["overall"]["classrooms"] == 1
    assert result["overall"]["shares"] == _shares(80)
    assert [item["semester"] for item in result["semesters"]] == ["2026.1"]


@pytest.mark.parametrize("team", [["Ana"], ["Ana", "João"]])
def test_consulta_real_compara_os_docentes_vinculados_sem_misturar_equipes(
    client, database, team
):
    with database.begin() as session:
        session.add(Subject(code="FGA0003", name="Matéria"))
        people = {name: Professor(name=name) for name in ["Ana", "João", "Outro"]}
        current, previous, different = [
            Classroom(
                subject_code="FGA0003", semester=semester, number=number, statistics=s
            )
            for semester, number, s in [
                ("2026.2", "01", None),
                ("2026.1", "01", _shares(80)),
                ("2026.1", "02", _shares(0)),
            ]
        ]
        session.add_all([*people.values(), current, previous, different])
        professors = [people[name] for name in team]
        _link(session, current, *professors)
        _link(session, previous, *professors)
        _link(session, different, *professors, people["Outro"])

    response = _get(client)
    assert response.status_code == 200
    assert response.json()["overall"] == {
        "semester": None,
        "classrooms": 1,
        "shares": _shares(80),
    }
