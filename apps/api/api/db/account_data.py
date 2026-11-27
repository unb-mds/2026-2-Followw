from collections.abc import Awaitable, Callable
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.main import Database
from api.db.models import UserDataDeletion
from api.modules.me.repository import UserRepository


class AccountDataOperationExpired(HTTPException):
    def __init__(self) -> None:
        super().__init__(
            409, "Os dados foram excluídos durante a consulta. Tente novamente."
        )


async def check_account_data(
    session: AsyncSession,
    registration: str,
    started_at: datetime,
    *,
    lock: bool = False,
) -> datetime | None:
    user = await UserRepository(session).get_by_registration(
        registration, for_update=lock
    )
    deletion = await session.get(UserDataDeletion, user.id) if user else None
    if deletion is not None and deletion.deleted_at >= started_at:
        raise AccountDataOperationExpired()
    return deletion.deleted_at if deletion is not None else None


class SyncDatabase:
    """Serializa gravações com a exclusão e descarta trabalho anterior a ela."""

    def __init__(self, db: Database, registration: str, started_at: datetime) -> None:
        self._db = db
        self._registration = registration
        self._started_at = started_at

    async def check_current(self) -> datetime | None:
        return await self._db.read(
            lambda session: check_account_data(
                session, self._registration, self._started_at
            )
        )

    async def read[T](self, query: Callable[[AsyncSession], Awaitable[T]]) -> T:
        return await self._db.read(query)

    async def write[T](self, write: Callable[[AsyncSession], Awaitable[T]]) -> T:
        async def guarded(session: AsyncSession) -> T:
            await check_account_data(
                session, self._registration, self._started_at, lock=True
            )
            return await write(session)

        return await self._db.write(guarded)
