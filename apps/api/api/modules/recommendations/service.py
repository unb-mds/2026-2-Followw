from typing import NamedTuple
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from api import academic_calendar
from api.cache import Freshness
from api.db.enums import ClassroomStatus, UserLevel
from api.db.models import OwnLink, User
from api.modules.classrooms.repository import ClassroomRepository
from api.modules.classrooms.service import (
    ClassroomService,
    grade_freshness,
    sync_grades,
)
from api.modules.me.profile import profile_freshness, sync_profile
from api.modules.me.repository import UserRepository
from api.modules.recommendations.ranking import (
    Component,
    Recommendation,
    normalize,
    rank,
)
from api.modules.recommendations.repository import RecommendationRepository
from api.sync import Cached, Sync


class Ranking(NamedTuple):
    semester: str | None
    items: list[Recommendation]
    curriculum: dict[str, Component]


class Student(NamedTuple):
    user_id: UUID
    unity_id: int | None
    curriculum: dict[str, Component]


class RecommendationService:
    def __init__(self, sync: Sync) -> None:
        self._sync = sync

    async def recommend(self) -> Ranking:
        """As matérias da oferta mais recente, ordenadas para o próximo semestre do aluno."""
        registration = self._sync.registration

        async def profile(
            session: AsyncSession,
        ) -> Cached[tuple[UserLevel | None, Student | None]] | None:
            user = await UserRepository(session).get_by_registration(registration)
            if user is None or user.profile_synced_at is None:
                return None
            state = profile_freshness(user.profile_synced_at)
            student = await _student(session, user)
            # Sem matriz, só o perfil em dia confirma a ausência.
            if (
                student is None
                and user.level == UserLevel.GRADUACAO
                and state is Freshness.STALE
            ):
                return None
            return Cached((user.level, student), user.profile_synced_at, state)

        level, student = await self._sync.resolve(sync_profile, None, profile)
        if level != UserLevel.GRADUACAO:
            raise HTTPException(
                422, "Recomendações disponíveis somente para graduação."
            )
        if student is None:
            raise HTTPException(422, "Matriz curricular do aluno não identificada.")
        await ClassroomService(self._sync).list_links("all")
        reference, links = await self._sync.db.read(
            lambda session: _history(session, student.user_id)
        )
        if links:

            async def load(session: AsyncSession) -> Cached[bool] | None:
                current = await ClassroomRepository(session).list_student_links(
                    student.user_id, reference
                )
                if not current:
                    user = await session.get(User, student.user_id)
                    if user is None or user.classrooms_synced_at is None:
                        return None
                    return Cached(True, user.classrooms_synced_at, Freshness.FROZEN)
                if any(link.row.grade_synced_at is None for link in current):
                    return None
                states = [
                    grade_freshness(link, link.row.grade_synced_at) for link in current
                ]
                state = (
                    Freshness.STALE
                    if Freshness.STALE in states
                    else Freshness.FROZEN
                    if all(s is Freshness.FROZEN for s in states)
                    else Freshness.FRESH
                )
                # Datas congeladas não envelhecem o cache das menções ainda mutáveis.
                mutable = [
                    link
                    for link, freshness in zip(current, states)
                    if freshness is not Freshness.FROZEN
                ]
                return Cached(
                    True,
                    min(link.row.grade_synced_at for link in mutable or current),
                    state,
                )

            await self._sync.resolve(sync_grades, None, load)
        items = await self._sync.db.read(
            lambda session: _rank(session, student, reference)
        )
        return Ranking(reference, items, student.curriculum)


async def _student(session: AsyncSession, user: User) -> Student | None:
    """O aluno com a matriz gravada; `None` sem ela."""
    if user.curriculum_id is None:
        return None
    return Student(
        user.id,
        user.course.unity_id if user.course else None,
        await RecommendationRepository(session).components(user.curriculum_id),
    )


async def _history(
    session: AsyncSession, user_id: UUID
) -> tuple[str | None, list[OwnLink]]:
    """O semestre da oferta e os vínculos de aluno até ele."""
    repository = ClassroomRepository(session)
    reference = await repository.offer_semester()
    return reference, await repository.list_student_links(user_id, reference)


def _in_progress(link: OwnLink) -> bool:
    """Cursando, ou encerrada com a menção ainda por consolidar."""
    row = link.row
    return row.status == ClassroomStatus.CURSANDO or (
        row.status == ClassroomStatus.CONCLUIDO
        and row.grade is None
        and not academic_calendar.grades_closed(row.classroom.semester)
    )


async def _rank(
    session: AsyncSession, student: Student, reference: str | None
) -> list[Recommendation]:
    classrooms = ClassroomRepository(session)
    links = await classrooms.list_student_links(student.user_id, reference)
    if any(link.row.grade_synced_at is None for link in links):
        raise HTTPException(
            503, "Histórico atualizado durante a consulta; tente novamente."
        )
    curriculum = student.curriculum
    if not curriculum:
        return []
    completed = {
        normalize(link.row.classroom.subject_code)
        for link in links
        if link.row.grade and link.row.grade.approved
    }
    enrolled = {
        normalize(link.row.classroom.subject_code)
        for link in links
        if _in_progress(link)
    }
    # Fora da matriz é módulo livre: só os componentes dela importam.
    offered = curriculum.keys() & {
        normalize(code) for code in await classrooms.offered_subject_codes(reference)
    }
    catalog = await RecommendationRepository(session).catalog(set(curriculum))
    return rank(
        catalog=catalog,
        offered=offered & catalog.keys(),
        curriculum=curriculum,
        completed=completed,
        enrolled=enrolled - completed,
        unity_id=student.unity_id,
    )
