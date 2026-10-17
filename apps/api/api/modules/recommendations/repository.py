from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.enums import ClassroomRole, ClassroomStatus
from api.db.models import Classroom, CurriculumComponent, OwnLink, Subject
from api.modules.classrooms.repository import ClassroomRepository
from api.modules.me.repository import UserRepository
from api.modules.public_courses.repository import PublicCourseRepository
from api.modules.recommendations.ranking import (
    CatalogSubject,
    Component,
    CurriculumInfo,
    Recommendation,
    components_by_code,
    normalize,
    rank,
    select_curriculum,
    semester,
)


class RecommendationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def offer_semester(self) -> str | None:
        values = await self._session.scalars(select(Classroom.semester).distinct())
        return max(
            (value for value in values if semester(value)), key=semester, default=None
        )

    async def student_links(
        self, registration: str, reference: str | None
    ) -> list[OwnLink]:
        user = await UserRepository(self._session).get_by_registration(registration)
        if user is None or reference is None:
            return []
        links = await ClassroomRepository(self._session).list_by_user_id(user.id)
        return [
            link
            for link in links
            if link.row.role == ClassroomRole.ALUNO
            and semester(link.row.classroom.semester)
            and semester(link.row.classroom.semester) <= semester(reference)
        ]

    async def curriculum(self, registration: str) -> dict[str, Component] | None:
        """Os componentes da matriz gravada do aluno, sem estimar nada."""
        user = await UserRepository(self._session).get_by_registration(registration)
        if user is None or user.curriculum_id is None:
            return None
        return await self._components(user.curriculum_id)

    async def assign_curriculum(self, registration: str) -> None:
        """Estima e grava a matriz do aluno, só enquanto ela ainda não existe."""
        user = await UserRepository(self._session).get_by_registration(registration)
        if user is None or user.curriculum_id is not None or user.course is None:
            return
        options = [
            CurriculumInfo.model_validate(c)
            for c in await PublicCourseRepository(self._session).list_curricula(
                user.course.id
            )
        ]
        selected = select_curriculum(
            options,
            await self.offer_semester(),
            user.entry_semester,
            user.course.shift,
        )
        if selected is not None:
            user.curriculum_id = selected.id
            await self._session.flush()

    async def recommend(
        self, registration: str, reference: str | None
    ) -> list[Recommendation]:
        user = await UserRepository(self._session).get_by_registration(registration)
        assert user is not None
        links = await self.student_links(registration, reference)
        if any(link.row.grade_synced_at is None for link in links):
            raise HTTPException(
                503, "Histórico atualizado durante a consulta; tente novamente."
            )
        if user.curriculum_id is None:
            return []
        curriculum = await self._components(user.curriculum_id)
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
            for code in await self._session.scalars(
                select(Classroom.subject_code).where(Classroom.semester == reference)
            )
        }
        catalog = {
            normalize(subject.code): CatalogSubject.model_validate(subject)
            for subject in await self._session.scalars(
                select(Subject).where(
                    func.upper(func.trim(Subject.code)).in_(offered | curriculum.keys())
                )
            )
        }
        return rank(
            catalog=catalog,
            offered=offered & catalog.keys(),
            curriculum=curriculum,
            completed=completed,
            enrolled=enrolled - completed,
            unity_id=user.course.unity_id,
        )

    async def _components(self, curriculum_id: UUID) -> dict[str, Component]:
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
