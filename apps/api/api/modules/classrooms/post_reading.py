from collections.abc import Collection
from uuid import UUID

from pydantic import Field
from sigaa_client import ClassroomPost
from sqlalchemy import delete, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.models import ClassroomPostRead, ClassroomPosts


class ClassroomPostView(ClassroomPost):
    is_read: bool = Field(description="O usuário confirmou a leitura da postagem.")


class PostReadingRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def read_ids(self, user_id: UUID, post_ids: Collection[UUID]) -> set[UUID]:
        if not post_ids:
            return set()
        rows = await self._session.scalars(
            select(ClassroomPostRead.post_id).where(
                ClassroomPostRead.user_id == user_id,
                ClassroomPostRead.post_id.in_(post_ids),
            )
        )
        return set(rows)

    async def mark(self, user_id: UUID, post: ClassroomPosts) -> None:
        stmt = insert(ClassroomPostRead).values(user_id=user_id, post_id=post.id)
        await self._session.execute(
            stmt.on_conflict_do_nothing(constraint="uq_classroom_post_read")
        )

    async def unmark(self, user_id: UUID, post_id: UUID) -> None:
        await self._session.execute(
            delete(ClassroomPostRead).where(
                ClassroomPostRead.user_id == user_id,
                ClassroomPostRead.post_id == post_id,
            )
        )

    async def merge_users(self, account_id: UUID, shadow_id: UUID) -> None:
        taken = select(ClassroomPostRead.post_id).where(
            ClassroomPostRead.user_id == account_id
        )
        await self._session.execute(
            update(ClassroomPostRead)
            .where(
                ClassroomPostRead.user_id == shadow_id,
                ClassroomPostRead.post_id.not_in(taken),
            )
            .values(user_id=account_id)
            .execution_options(synchronize_session=False)
        )
