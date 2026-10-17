from collections.abc import Collection
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.models import CurriculumComponent, Subject
from api.modules.me.repository import UserRepository
from api.modules.recommendations.ranking import (
    CatalogSubject,
    Component,
    components_by_code,
    normalize,
)


class RecommendationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def curriculum(self, registration: str) -> dict[str, Component] | None:
        """Os componentes da matriz gravada do aluno."""
        user = await UserRepository(self._session).get_by_registration(registration)
        if user is None or user.curriculum_id is None:
            return None
        return await self.components(user.curriculum_id)

    async def components(self, curriculum_id: UUID) -> dict[str, Component]:
        return components_by_code(
            [
                Component.model_validate(c)
                for c in await self._session.scalars(
                    select(CurriculumComponent).where(
                        CurriculumComponent.curriculum_id == curriculum_id
                    )
                )
            ]
        )

    async def catalog(self, codes: Collection[str]) -> dict[str, CatalogSubject]:
        """Os componentes pelos códigos normalizados, como os grava o seed."""
        return {
            normalize(subject.code): CatalogSubject.model_validate(subject)
            for subject in await self._session.scalars(
                select(Subject).where(Subject.code.in_(codes))
            )
        }
