from datetime import timedelta

import httpx
from sigaa_client import (
    Classroom as SigaaClassroom,
)
from sigaa_client import (
    ClassroomGrade,
    Grade,
)
from sigaa_client import (
    Subject as SigaaSubject,
)
from sqlalchemy import select

from api.db.enums import ClassroomStatus
from api.db.models import (
    Classroom,
    ClassroomParticipant,
    User,
)

from .helpers import (
    NOW,
    URL,
    codes,
)


def test_mencoes_ausentes_sincronizam_antes_do_ranking(scene, stub_sigaa):
    scene.subject("A")
    scene.subject("B", prerequisites=[["A"]])
    scene.history("A")
    scene.user(grades_synced_at=None)
    stub_sigaa.classrooms.list_grades.return_value = [
        ClassroomGrade(subject_code="A", semester="2026.1", grade=Grade.MM)
    ]
    assert codes(scene.get()) == ["B"]
    stub_sigaa.classrooms.list_grades.assert_awaited_once()


def test_historico_ausente_difere_de_sincronizado_vazio(scene, stub_sigaa):
    scene.subject("A")
    scene.get()
    stub_sigaa.classrooms.list_classrooms.assert_not_awaited()
    with scene.db.begin() as session:
        session.get(User, scene.user_id).classrooms_synced_at = None
    scene.get()
    stub_sigaa.classrooms.list_classrooms.assert_awaited_once()


def test_only_if_cached_sem_historico_e_falha_na_origem(scene, stub_sigaa):
    scene.subject("A")
    scene.history("B")
    scene.user(grades_synced_at=None)
    assert (
        scene.client.get(URL, headers={"Cache-Control": "only-if-cached"}).status_code
        == 504
    )
    stub_sigaa.classrooms.list_grades.side_effect = httpx.ConnectError("offline")
    assert scene.client.get(URL).status_code == 502


def test_mencoes_vencidas_com_swr_e_no_cache(scene, stub_sigaa, qstash):
    scene.subject("A")
    # Trancada: sem menção, não conta como em andamento.
    link_id = scene.history("A", term="2026.2", status=ClassroomStatus.TRANCADO)
    scene.user(grades_synced_at=NOW - timedelta(days=2))
    stub_sigaa.classrooms.list_grades.return_value = [
        ClassroomGrade(subject_code="A", semester="2026.2", grade=Grade.MM)
    ]
    assert codes(scene.get()) == ["A"]
    assert any(
        step.task == "sync_grades" for job in qstash.jobs() for step in job.steps
    )
    assert scene.get() == []
    with scene.db.begin() as session:
        row = session.get(ClassroomParticipant, link_id)
        row.grade = None
        session.get(User, scene.user_id).grades_synced_at = NOW
    # A revalidação das turmas precisa preservar o vínculo da fonte sintética.
    with scene.db() as session:
        row = session.get(ClassroomParticipant, link_id)
        classroom = session.get(Classroom, row.classroom_id)
        stub_sigaa.classrooms.list_classrooms.return_value = [
            SigaaClassroom(
                id=row.front_end_id,
                number=classroom.number,
                semester="2026.2",
                current=True,
                subject=SigaaSubject(code="A", name="A", hours=60),
            )
        ]
    assert scene.get(headers={"Cache-Control": "no-cache"}) == []
    stub_sigaa.profile.get_profile.assert_awaited_once()
    stub_sigaa.classrooms.list_classrooms.assert_awaited_once()
    assert stub_sigaa.classrooms.list_grades.await_count == 2


def test_mencoes_congeladas_nao_sao_revalidadas(scene, stub_sigaa):
    scene.subject("A")
    scene.history("H", grade=Grade.MM, term="2020.1")
    scene.get(headers={"Cache-Control": "only-if-cached"})
    scene.get()
    stub_sigaa.classrooms.list_grades.assert_not_awaited()


def test_perfil_ausente_sincroniza_e_falhas(scene, stub_sigaa):
    scene.subject("A")
    with scene.db.begin() as session:
        session.get(User, scene.user_id).profile_synced_at = None
    assert (
        scene.client.get(URL, headers={"Cache-Control": "only-if-cached"}).status_code
        == 504
    )
    scene.get()
    stub_sigaa.profile.get_profile.assert_awaited_once()


def test_perfil_vencido_sem_matriz_sincroniza_antes_do_422(scene, stub_sigaa, qstash):
    scene.subject("A")
    scene.user(curriculum_id=None, profile_synced_at=NOW - timedelta(days=2))
    profile = stub_sigaa.profile.get_profile
    profile.return_value = profile.return_value.model_copy(
        update={"entry_semester": "2025.1"}
    )
    assert (
        scene.client.get(URL, headers={"Cache-Control": "only-if-cached"}).status_code
        == 504
    )
    profile.assert_not_awaited()
    assert codes(scene.get()) == ["A"]
    profile.assert_awaited_once()
    assert not any(
        step.task == "sync_profile" for job in qstash.jobs() for step in job.steps
    )
    # Perfil em dia sem matriz responde 422 sem ir ao SIGAA.
    scene.user(curriculum_id=None)
    assert scene.client.get(URL).status_code == 422
    profile.assert_awaited_once()


def test_mencoes_vencidas_servem_stale_if_error(scene, stub_sigaa):
    scene.subject("A")
    scene.subject("B")
    scene.history("OLD", grade=Grade.MM, term="2020.1")
    scene.history("A", term="2026.2")
    scene.user(grades_synced_at=NOW - timedelta(days=2))
    with scene.db() as session:
        links = list(session.scalars(select(ClassroomParticipant)))
        stub_sigaa.classrooms.list_classrooms.return_value = [
            SigaaClassroom(
                id=link.front_end_id,
                number=link.classroom.number,
                semester=link.classroom.semester,
                current=link.classroom.semester == "2026.2",
                subject=SigaaSubject(
                    code=link.classroom.subject_code,
                    name=link.classroom.subject_code,
                    hours=60,
                ),
            )
            for link in links
        ]
    stub_sigaa.classrooms.list_grades.side_effect = httpx.ConnectError("offline")
    result = scene.get(headers={"Cache-Control": "no-cache, stale-if-error=259200"})
    assert codes(result) == ["B"]


async def test_historico_removido_durante_sync_das_mencoes_e_vazio_valido(
    scene, async_database, stub_sigaa
):
    scene.subject("A")
    link_id = scene.history("OLD")
    scene.user(grades_synced_at=None)

    async def grades_after_history_refresh():
        async with async_database.begin() as session:
            link = await session.get(ClassroomParticipant, link_id)
            link.front_end_id = None
        return []

    stub_sigaa.classrooms.list_grades.side_effect = grades_after_history_refresh
    assert codes(scene.get()) == ["A"]


def test_historico_novo_apos_resolver_mencoes_pede_nova_tentativa(scene, monkeypatch):
    from api.sync.engine import Sync

    scene.subject("A")
    scene.history("OLD", grade=Grade.MM)
    resolve = Sync.resolve

    async def resolve_with_concurrent_history(self, task, target, load):
        result = await resolve(self, task, target, load)
        if task.__name__ == "sync_grades":
            # Como o sync das turmas: vínculo novo zera a data das menções.
            scene.history("NEW")
            scene.user(grades_synced_at=None)
        return result

    monkeypatch.setattr(Sync, "resolve", resolve_with_concurrent_history)
    response = scene.client.get(URL)
    assert response.status_code == 503
