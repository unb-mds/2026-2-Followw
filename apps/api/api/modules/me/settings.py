from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from api.db.main import Database
from api.modules.me.repository import UserRepository

DisplayName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=24)
]


class UserSettings(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    display_name: str | None = Field(default=None, alias="displayName")


class UserSettingsPatch(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    display_name: DisplayName | None = Field(default=None, alias="displayName")


async def read_settings(db: Database, registration: str) -> UserSettings:
    settings = await db.read(
        lambda session: UserRepository(session).get_settings(registration)
    )
    return UserSettings.model_validate(settings)


async def save_settings(
    db: Database, registration: str, patch: UserSettingsPatch
) -> UserSettings:
    data = patch.model_dump(by_alias=True, exclude_unset=True)
    # O sync do perfil pode criar o usuário ao mesmo tempo: a retentativa vira update.
    settings = await db.write(
        lambda session: UserRepository(session).update_settings(registration, data)
    )
    return UserSettings.model_validate(settings)
