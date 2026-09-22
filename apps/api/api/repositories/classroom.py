from typing import Annotated
from uuid import UUID

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from api.db.main import get_db
from api.db.models import Classroom, ClassroomUser


class ClassroomRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_by_user_id(
        self, user_id: UUID, *, semester: str | None = None
    ) -> list[Classroom]:
        query = (
            select(Classroom)
            .join(ClassroomUser, ClassroomUser.classroom_id == Classroom.id)
            .where(ClassroomUser.user_id == user_id)
            .options(selectinload(Classroom.subject))
            .distinct()
            .order_by(Classroom.number, Classroom.id)
        )
        if semester is not None:
            query = query.where(ClassroomUser.semester == semester)
        return list(await self._session.scalars(query))


def get_classroom_repository(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> ClassroomRepository:
    return ClassroomRepository(session)


ClassroomRepositoryDep = Annotated[
    ClassroomRepository, Depends(get_classroom_repository)
]
