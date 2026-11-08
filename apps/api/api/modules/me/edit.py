from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from api.core.config import settings
from api.db.main import Database
from api.modules.me.profile import UserProfile, _to_profile
from api.modules.me.repository import UserRepository
from api.sigaa import SigaaConnection


class ProfileEdit(BaseModel):
    model_config = ConfigDict(extra="forbid")
    bio: Annotated[str, Field(max_length=5000)]
    photo_action: Literal["keep", "replace", "remove"] = "keep"


def check_profile_origin(request: Request) -> None:
    origin = request.headers.get("origin")
    if origin not in settings.cors_origins:
        raise HTTPException(403, "Origem não autorizada para editar o perfil.")


async def edit_profile(
    body: ProfileEdit, photo: bytes | None, connection: SigaaConnection, db: Database
) -> UserProfile:
    if (body.photo_action == "replace") != (photo is not None):
        raise HTTPException(422, "Envie uma foto somente ao selecionar substituição.")
    fresh = SigaaConnection(connection.credentials)
    try:
        client = await fresh.client()
        profile = await client.profile.update_profile(
            password=connection.credentials.password.get_secret_value(),
            bio=body.bio,
            photo=photo,
            remove_photo=body.photo_action == "remove",
        )

        async def save(session):
            user = await UserRepository(session).save_profile(
                profile, datetime.now(UTC), login=connection.registration
            )
            user.photo = profile.photo
            await session.flush()
            await session.refresh(user)
            return _to_profile(user)

        return await db.write(save)
    finally:
        await fresh.aclose(logout=True)
