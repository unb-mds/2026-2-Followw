from typing import NamedTuple

from fastapi import HTTPException
from sigaa_client import UserLevel
from sqlalchemy.ext.asyncio import AsyncSession

from api.cache import Freshness
from api.modules.classrooms.service import (
    ClassroomService,
    grade_freshness,
    sync_grades,
)
from api.modules.me.profile import ProfileService
from api.modules.me.repository import UserRepository
from api.modules.recommendations.ranking import Recommendation
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
        await ClassroomService(self._sync).list_links("all")
        reference = await self._sync.db.read(
            lambda session: RecommendationRepository(session).offer_semester()
        )
        registration = self._sync.registration
        links = await self._sync.db.read(
            lambda session: RecommendationRepository(session).student_links(
                registration, reference
            )
        )
        if links:

            async def load(session: AsyncSession) -> Cached[bool] | None:
                current = await RecommendationRepository(session).student_links(
                    registration, reference
                )
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
            lambda session: RecommendationRepository(session).recommend(
                registration, reference
            )
        )
        return Ranking(reference, items)
