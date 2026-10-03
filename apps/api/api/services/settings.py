from typing import Annotated

from fastapi import Depends
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
        async with self._sessionmaker() as session:
            repository = UserRepository(session)
            patch_data = patch.model_dump(by_alias=True, exclude_unset=True)
            updated = await repository.update_settings(registration, patch_data)
            await session.commit()
            return UserSettings.model_validate(updated)


SettingsServiceDep = Annotated[SettingsService, Depends()]
