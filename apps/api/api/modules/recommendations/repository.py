from collections.abc import Collection
from uuid import UUID

from sigaa_client import Grade
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.enums import ClassroomRole, ClassroomStatus
from api.db.models import (
    Classroom,
    ClassroomParticipant,
    CurriculumComponent,
    Subject,
)
from api.modules.me.repository import UserRepository
from api.modules.me.transcript import TranscriptRepository
from api.modules.recommendations.ranking import (
    CatalogSubject,
    Component,
    components_by_code,
)
from api.schemas import normalize

APPROVED_GRADES = [grade for grade in Grade if grade.approved]
# Trancamento ou indeferimento não deixa menção pendente: a tentativa não conta.
WITHOUT_ATTEMPT = {ClassroomStatus.TRANCADO, ClassroomStatus.DENIED}


class RecommendationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def curriculum(self, registration: str) -> dict[str, Component] | None:
        """Os componentes da matriz gravada do aluno."""
        user = await UserRepository(self._session).get_by_registration(registration)
        if user is None or user.curriculum_id is None:
            return None
        return await self.components(user.curriculum_id)

    async def done(self, user_id: UUID) -> set[str]:
        """Como no ranking: aprovadas, cumpridas no histórico e as ainda sem menção."""
        grade, status = ClassroomParticipant.grade, ClassroomParticipant.status
        codes = await self._session.scalars(
            select(Classroom.subject_code)
            .join(ClassroomParticipant.classroom)
            .where(
                ClassroomParticipant.user_id == user_id,
                ClassroomParticipant.role == ClassroomRole.ALUNO,
                ClassroomParticipant.front_end_id.is_not(None),
                or_(
                    grade.in_(APPROVED_GRADES),
                    and_(
                        grade.is_(None),
                        or_(status.is_(None), status.not_in(WITHOUT_ATTEMPT)),
                    ),
                ),
            )
        )
        completed = await TranscriptRepository(self._session).completed(user_id)
        return {normalize(code) for code in [*codes, *completed]}

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
