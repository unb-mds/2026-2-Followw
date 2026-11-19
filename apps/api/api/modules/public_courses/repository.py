import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.models import Course, Curriculum, CurriculumComponent, Subject
from api.db.pagination import paginate
from api.db.search import contains_all_terms


class PublicCourseRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_courses(
        self, q: str | None, unit_id: int | None, page: int, page_size: int
    ) -> tuple[list[Course], int]:
        conditions = []
        if q is not None:
            conditions.append(contains_all_terms(Course.name, q))
        if unit_id is not None:
            conditions.append(Course.unit_id == unit_id)
        return await paginate(
            self._session,
            select(Course).where(*conditions).order_by(Course.name, Course.id),
            page,
            page_size,
        )

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
