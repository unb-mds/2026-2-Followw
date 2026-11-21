from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import pytest
from sigaa_client import Classroom, ClassroomFrequency, ClassroomGrade, Grade, Subject
from sqlalchemy import update

from api.db.models import ClassroomParticipant
from api.modules.oauth.scopes import Scope


@pytest.fixture
def turmas(stub_sigaa):
    subject = Subject(name="Compiladores", code="CIC0001", hours=60)
    atual = Classroom(
        id="AAA",
        number="01",
        semester="2026.2",
        current=True,
        schedule="3M12",
        subject=subject,
    )
    antiga = atual.model_copy(
        update={"id": "BBB", "semester": "2025.2", "current": False}
    )
    stub_sigaa.classrooms.list_classrooms.return_value = [atual, antiga]
    stub_sigaa.classrooms.list_grades.return_value = [
        ClassroomGrade(subject_code=subject.code, semester="2025.2", grade=Grade.MS)
    ]
    stub_sigaa.classrooms.get_classroom_frequency = AsyncMock(
        return_value=ClassroomFrequency(
            progress={"taught": 10, "total": 60, "percentage": 17}
        )
    )
    return stub_sigaa


def test_consulta_historica_por_lista_e_id_exige_aceite_adicional(
    client, emitir, turmas
):
    def headers(*extra):
        grant = emitir(Scope.CLASSROOMS, Scope.MEMBERS, *extra)
        return {"Authorization": f"Bearer {grant.access_token}"}

    current = headers()
    rooms = client.get("/classrooms", headers=current).json()
    assert [room["id"] for room in rooms] == ["AAA"]
    assert "status" in rooms[0] and "grade" not in rooms[0]
    for path in (
        "/classrooms?semester=all",
        "/classrooms?semester=2025.2",
        "/classrooms/BBB/members",
    ):
        assert client.get(path, headers=current).status_code == 403
    past = client.get(
        "/classrooms?semester=2025.2", headers=headers(Scope.HISTORY)
    ).json()
    assert past[0]["id"] == "BBB" and "grade" not in past[0]
    graded = client.get(
        "/classrooms?semester=2025.2", headers=headers(Scope.HISTORY, Scope.GRADES)
    ).json()
    assert graded[0]["grade"] == "MS"


def test_agenda_separa_horarios_da_frequencia(
    client, emitir, turmas, database, qstash, hoje
):
    hoje(datetime(2026, 9, 17, 15))

    def aulas(*permissions):
        pair = emitir(Scope.CLASSROOMS, *permissions)
        response = client.get(
            "/lessons", headers={"Authorization": f"Bearer {pair.access_token}"}
        )
        assert response.status_code == 200
        return [lesson for day in response.json() for lesson in day["lessons"]]

    schedule = aulas()
    turmas.classrooms.get_classroom_frequency.assert_not_awaited()
    assert schedule and "start_time" in schedule[0]
    assert all("marked" not in lesson and "status" not in lesson for lesson in schedule)
    with database.begin() as session:
        session.execute(
            update(ClassroomParticipant).values(
                frequency_synced_at=datetime.now(UTC) - timedelta(days=7)
            )
        )
    turmas.classrooms.get_classroom_frequency.reset_mock()
    attendance = aulas(Scope.FREQUENCY)
    assert all({"marked", "status"} <= lesson.keys() for lesson in attendance)
    turmas.classrooms.get_classroom_frequency.assert_awaited_once_with("AAA")
    assert not qstash.published


def test_busca_publica_com_bearer_so_oferece_catalogo(client, emitir):
    pair = emitir()
    response = client.get(
        "/public/subjects", headers={"Authorization": f"Bearer {pair.access_token}"}
    )
    assert response.status_code == 422
    assert "q" in response.json()["detail"]


def test_leitura_de_posts_nao_permite_mudar_marcacao(client, emitir):
    pair = emitir(Scope.POSTS)
    headers = {"Authorization": f"Bearer {pair.access_token}"}
    for method in (client.put, client.delete):
        assert (
            method("/classrooms/AAA/posts/news:1/read", headers=headers).status_code
            == 403
        )
