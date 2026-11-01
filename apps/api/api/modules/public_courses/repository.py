import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.models import Course, Curriculum, CurriculumComponent, Subject
from api.db.search import all_terms, contains_term


class PublicCourseRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_courses(
        self, q: str | None = None, unit_id: int | None = None
    ) -> list[Course]:
        query = select(Course).order_by(Course.name, Course.id)
        if q is not None:
            query = query.where(
                all_terms(q, lambda term: contains_term(Course.name, term))
            )
        if unit_id is not None:
            query = query.where(Course.unit_id == unit_id)
        return list(await self._session.scalars(query))

    async def get_course(self, course_id: int) -> Course | None:
        return await self._session.get(Course, course_id)

    async def list_curricula(self, course_id: int) -> list[Curriculum]:
        return list(
            await self._session.scalars(
                select(Curriculum)
                .where(Curriculum.course_id == course_id, Curriculum.active.is_(True))
                .order_by(Curriculum.valid_from, Curriculum.sigaa_id)
            )
        )

    async def list_components(
        self, curriculum_id: uuid.UUID
    ) -> list[tuple[CurriculumComponent, Subject | None]]:
        rows = await self._session.execute(
            select(CurriculumComponent, Subject)
            .outerjoin(Subject, Subject.code == CurriculumComponent.subject_code)
            .where(CurriculumComponent.curriculum_id == curriculum_id)
            .order_by(CurriculumComponent.period, CurriculumComponent.subject_code)
        )
        return [(component, subject) for component, subject in rows]
