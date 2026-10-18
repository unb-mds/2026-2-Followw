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
    grades_freshness,
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

# Saída ou indeferimento não deixa menção pendente: a tentativa não conta.
_WITHOUT_ATTEMPT = {
    ClassroomStatus.TRANCADO,
    ClassroomStatus.REMOVIDO,
    ClassroomStatus.DENIED,
}


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
                user = await session.get(User, student.user_id)
                if not current:
                    if user is None or user.classrooms_synced_at is None:
                        return None
                    return Cached(True, user.classrooms_synced_at, Freshness.FROZEN)
                if user is None or user.grades_synced_at is None:
                    return None
                return Cached(
                    True,
                    user.grades_synced_at,
                    grades_freshness(current, user.grades_synced_at),
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
    user = await session.get(User, student.user_id)
    if links and (user is None or user.grades_synced_at is None):
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
    subjects = RecommendationRepository(session)
    catalog = await subjects.catalog(set(curriculum))
    requirements = {
        normalize(code)
        for subject in catalog.values()
        for rules in (subject.prerequisites, subject.corequisites)
        for group in rules or []
        for code in group
    }
    catalog.update(await subjects.catalog(requirements - catalog.keys()))
    return rank(
        catalog=catalog,
        offered=offered & catalog.keys(),
        curriculum=curriculum,
        completed=completed,
        enrolled=enrolled - completed,
        unresolved={
            normalize(link.row.classroom.subject_code)
            for link in links
            if link.row.grade is None and link.row.status not in _WITHOUT_ATTEMPT
        },
        unity_id=student.unity_id,
    )
