from collections.abc import Collection

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.models import Classroom, Subject, Unity


class SubjectCatalogRepository:
    """Componentes e turmas gravados pelo seed e pelo sync."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_subjects(
        self, code: str | None = None, unity_id: int | None = None
    ) -> list[Subject]:
        query = select(Subject).order_by(Subject.code)
        if code is not None:
            query = query.where(Subject.code == code)
        if unity_id is not None:
            query = query.where(Subject.unity_id == unity_id)
        return list(await self._session.scalars(query))

    async def list_unities(self) -> list[Unity]:
        return list(await self._session.scalars(select(Unity).order_by(Unity.id)))

    async def latest_semester(self) -> str | None:
        return await self._session.scalar(select(func.max(Classroom.semester)))

    async def list_classrooms(
        self, codes: Collection[str], semester: str
    ) -> list[Classroom]:
        if not codes:
            return []
        return list(
            await self._session.scalars(
                select(Classroom)
                .where(
                    Classroom.subject_code.in_(codes), Classroom.semester == semester
                )
                .order_by(Classroom.subject_code, Classroom.number)
            )
        )
