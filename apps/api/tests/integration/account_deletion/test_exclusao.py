import pytest
from sigaa_client import Credentials
from sqlalchemy import select

from api.db.models import (
    Classroom,
    ClassroomParticipant,
    ClassroomPostRead,
    ClassroomPosts,
    Curriculum,
    Lesson,
    LessonAttendance,
    User,
    UserCompletedSubject,
    UserDataDeletion,
)


def test_apaga_dados_privados_e_preserva_cadastro_compartilhado(
    client, conta, database, stub_sigaa
):
    response = client.delete("/me/data")
    assert response.status_code == 204
    assert response.headers["cache-control"] == "no-store"
    assert not response.headers.get_list("set-cookie")
    with database() as session:
        user = session.get(User, conta.user)
        assert (
            user.name,
            user.registration,
            user.old_registration,
            user.photo,
            user.email,
            user.course_id,
        ) == (
            "Estudante",
            "251000000",
            "241000000",
            "https://foto.test/eu.png",
            "eu@example.test",
            conta.course,
        )
        for field in (
            "bio",
            "curriculum_id",
            "entry_semester",
            "integralization",
            "workload",
            "ira",
            "mp",
            "level",
            "registered_at",
            "profile_synced_at",
            "classrooms_synced_at",
            "grades_synced_at",
            "dashboard_synced_at",
            "transcript_synced_at",
        ):
            assert getattr(user, field) is None, field
        assert user.settings == {}
        assert session.get(UserDataDeletion, user.id) is not None
        shared = session.get(ClassroomParticipant, conta.shared)
        assert shared.member and shared.user_id == user.id
        assert (
            shared.grade,
            shared.front_end_id,
            shared.frequency_synced_at,
            shared.frequency_status,
        ) == (None,) * 4
        assert not shared.current
        assert session.get(ClassroomParticipant, conta.own) is None
        assert (
            session.scalar(
                select(LessonAttendance).where(
                    LessonAttendance.classroom_participant_id == shared.id
                )
            )
            is None
        )
        assert (
            session.scalar(
                select(ClassroomPostRead).where(ClassroomPostRead.user_id == user.id)
            )
            is None
        )
        assert (
            session.scalar(
                select(UserCompletedSubject).where(
                    UserCompletedSubject.user_id == user.id
                )
            )
            is None
        )
    stub_sigaa.created.assert_not_called()


def test_preserva_dados_dos_colegas_e_conteudo_coletivo(client, conta, database):
    assert client.delete("/me/data").status_code == 204
    with database() as session:
        assert session.get(User, conta.peer).ira == 3
        assert session.get(ClassroomParticipant, conta.colleague).front_end_id == "CCC"
        assert session.scalar(
            select(LessonAttendance).where(
                LessonAttendance.classroom_participant_id == conta.colleague
            )
        )
        assert session.scalar(
            select(ClassroomPostRead).where(ClassroomPostRead.user_id == conta.peer)
        )
        assert session.scalar(
            select(UserCompletedSubject).where(
                UserCompletedSubject.user_id == conta.peer
            )
        )
        assert all(session.get(Classroom, id) for id in conta.classrooms)
        assert session.get(ClassroomPosts, conta.post)
        assert session.get(Lesson, conta.lesson)
        assert session.get(Curriculum, conta.matrix)


def test_sessao_antiga_continua_valida_e_repeticao_e_segura(
    client, conta, cookies, database
):
    client.cookies.update(
        cookies(refresh=Credentials(registration="241000000", password="senha123"))
    )
    before = dict(client.cookies)
    for _ in range(2):
        assert client.delete("/me/data").status_code == 204
        response = client.get("/me/data")
        assert response.status_code == 200
        assert response.json() == {
            "registration": "241000000",
            "name": "Estudante",
            "applications": [],
            "has_connected_applications": False,
        }
    assert dict(client.cookies) == before


def test_sessao_sem_dados_pode_consultar_e_excluir_sem_sincronizar(
    client, cookies, stub_sigaa
):
    client.cookies.update(
        cookies(refresh=Credentials(registration="251000000", password="senha123"))
    )
    assert client.get("/me/data").json() == {
        "registration": "251000000",
        "name": None,
        "applications": [],
        "has_connected_applications": False,
    }
    assert client.delete("/me/data").status_code == 204
    stub_sigaa.created.assert_not_called()


def test_sem_login_e_bearer_nao_podem_consultar_nem_excluir(api, cookies, subtests):
    for method in (api.get, api.delete):
        for jar, headers in (
            ({}, {}),
            ({"refresh_token": "adulterado"}, {}),
            (
                cookies(
                    refresh=Credentials(registration="251000000", password="senha123")
                ),
                {"Authorization": "Bearer qualquer"},
            ),
        ):
            with subtests.test(method=method.__name__, headers=headers):
                api.cookies.clear()
                api.cookies.update(jar)
                assert method("/me/data", headers=headers).status_code == 401


def test_nao_aceita_outra_matricula_como_alvo(client, conta, database):
    assert client.delete("/me/data?registration=251000001").status_code == 204
    with database() as session:
        assert session.get(User, conta.peer).ira == 3
        assert session.get(User, conta.user).ira is None


def test_falha_na_exclusao_reverte_todas_as_alteracoes(
    client, conta, database, monkeypatch
):
    from api.db.models import OAuthClient
    from api.modules.me import deletion

    original = deletion.delete

    def fail_at_applications(model):
        if model is OAuthClient:
            raise RuntimeError("Falha durante a exclusão")
        return original(model)

    monkeypatch.setattr(deletion, "delete", fail_at_applications)
    with pytest.raises(RuntimeError, match="Falha durante"):
        client.delete("/me/data")
    with database() as session:
        assert session.get(User, conta.user).ira == 4
        assert session.get(UserDataDeletion, conta.user) is None
        assert session.get(ClassroomParticipant, conta.own) is not None
        assert session.get(ClassroomParticipant, conta.shared).front_end_id == "AAA"
        assert session.scalar(
            select(LessonAttendance).where(
                LessonAttendance.classroom_participant_id == conta.shared
            )
        )
