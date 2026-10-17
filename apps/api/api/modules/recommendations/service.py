from typing import NamedTuple
from uuid import UUID

from fastapi import HTTPException
from sigaa_client import UserLevel
from sqlalchemy.ext.asyncio import AsyncSession

from api.cache import Freshness
from api.db.enums import ClassroomStatus
from api.db.models import OwnLink
from api.modules.classrooms.repository import ClassroomRepository
from api.modules.classrooms.service import (
    ClassroomService,
    grade_freshness,
    sync_grades,
)
from api.modules.me.profile import ProfileService
from api.modules.me.repository import UserRepository
from api.modules.recommendations.ranking import Recommendation, normalize, rank
from api.modules.recommendations.repository import RecommendationRepository
from api.sync import Cached, Sync


class Ranking(NamedTuple):
    semester: str | None
    items: list[Recommendation]


class RecommendationService:
    def __init__(self, sync: Sync) -> None:
        self._sync = sync

    async def recommend(self) -> Ranking:
        """As matérias da oferta mais recente, ordenadas para o próximo semestre do aluno."""
        profile = await ProfileService(self._sync).get_profile()
        if profile.level != UserLevel.GRADUACAO:
            raise HTTPException(
                422, "Recomendações disponíveis somente para graduação."
            )
        registration = self._sync.registration
        curriculum_id = await self._sync.db.read(
            lambda session: _curriculum_id(session, registration)
        )
        if curriculum_id is None:
            raise HTTPException(422, "Matriz curricular do aluno não identificada.")
        await ClassroomService(self._sync).list_links("all")
        reference = await self._sync.db.read(
            lambda session: ClassroomRepository(session).offer_semester()
        )
        links = await self._sync.db.read(
            lambda session: _student_links(session, registration, reference)
        )
        if links:

            async def load(session: AsyncSession) -> Cached[bool] | None:
                current = await _student_links(session, registration, reference)
                if not current:
                    user = await UserRepository(session).get_by_registration(
                        registration
                    )
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
            lambda session: _rank(session, registration, reference)
        )
        return Ranking(reference, items)


async def _student_links(
    session: AsyncSession, registration: str, reference: str | None
) -> list[OwnLink]:
    user = await UserRepository(session).get_by_registration(registration)
    if user is None:
        return []
    return await ClassroomRepository(session).list_student_links(user.id, reference)


async def _rank(
    session: AsyncSession, registration: str, reference: str | None
) -> list[Recommendation]:
    user = await UserRepository(session).get_by_registration(registration)
    assert user is not None
    links = await _student_links(session, registration, reference)
    if any(link.row.grade_synced_at is None for link in links):
        raise HTTPException(
            503, "Histórico atualizado durante a consulta; tente novamente."
        )
    repository = RecommendationRepository(session)
    curriculum = (
        await repository.components(user.curriculum_id) if user.curriculum_id else {}
    )
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
        if link.row.status == ClassroomStatus.CURSANDO
    }
    offered = {
        normalize(code)
        for code in await ClassroomRepository(session).offered_subject_codes(reference)
    }
    catalog = await repository.catalog(offered | curriculum.keys())
    return rank(
        catalog=catalog,
        offered=offered & catalog.keys(),
        curriculum=curriculum,
        completed=completed,
        enrolled=enrolled - completed,
        unity_id=user.course.unity_id,
    )


async def _curriculum_id(session: AsyncSession, registration: str) -> UUID | None:
    user = await UserRepository(session).get_by_registration(registration)
    return user.curriculum_id if user else None
