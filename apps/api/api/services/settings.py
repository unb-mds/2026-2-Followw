from contextlib import suppress
from typing import Annotated

from fastapi import Depends
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from api.db.main import get_sessionmaker
from api.modules.me.models import UserSettings, UserSettingsPatch
from api.repositories.user import UserRepository


class SettingsService:
    def __init__(
        self,
        sessionmaker: Annotated[
            async_sessionmaker[AsyncSession], Depends(get_sessionmaker)
        ],
    ) -> None:
        self._sessionmaker = sessionmaker

    async def get_settings(self, registration: str) -> UserSettings:
        async with self._sessionmaker() as session:
            repository = UserRepository(session)
            raw = await repository.get_settings(registration)
            return UserSettings.model_validate(raw)

    async def update_settings(
        self, registration: str, patch: UserSettingsPatch
    ) -> UserSettings:
        data = patch.model_dump(by_alias=True, exclude_unset=True)
        # O sync do perfil pode criar o usuário ao mesmo tempo: na nova tentativa vira update.
        with suppress(IntegrityError):
            return await self._write(registration, data)
        return await self._write(registration, data)

    async def _write(self, registration: str, data: dict[str, object]) -> UserSettings:
        async with self._sessionmaker() as session:
            updated = await UserRepository(session).update_settings(registration, data)
            await session.commit()
            return UserSettings.model_validate(updated)


SettingsServiceDep = Annotated[SettingsService, Depends()]
