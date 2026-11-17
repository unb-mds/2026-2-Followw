from datetime import UTC, datetime

import httpx
from sigaa_client import SigaaError

from api.db.main import Database
from api.modules.me.profile import UserProfile, _to_profile
from api.modules.me.repository import UserRepository
from api.sigaa import SigaaConnection

_REMOTE_ERRORS = (SigaaError, httpx.HTTPError)


async def edit_profile(
    connection: SigaaConnection,
    db: Database,
    *,
    bio: str | None,
    photo: bytes | None,
    remove_photo: bool,
) -> UserProfile:
    fresh = SigaaConnection(connection.credentials)
    try:
        client = await fresh.client()
        try:
            profile = await client.profile.update_profile(
                password=connection.credentials.password.get_secret_value(),
                bio=bio,
                photo=photo,
                remove_photo=remove_photo,
            )
        except _REMOTE_ERRORS as original_error:
            try:
                current = await client.profile.get_profile()
            except _REMOTE_ERRORS:
                raise original_error from None

            existing = await db.read(
                lambda s: UserRepository(s).get_by_registration(connection.registration)
            )
            old_photo = existing.photo if existing else None
            photo_applied = (remove_photo and current.photo is None) or (
                photo is not None and current.photo != old_photo
            )
            bio_applied = bio is not None and current.bio == bio
            if not (photo_applied or bio_applied):
                raise original_error from None
            profile = current

        synced_at = datetime.now(UTC)

        async def save(session):
            user = await UserRepository(session).save_profile(
                profile,
                synced_at,
                login=connection.registration,
                replace_photo=remove_photo or photo is not None,
            )
            await session.refresh(user, ["course", "curriculum"])
            return await _to_profile(session, user)

        return await db.write(save)
    finally:
        await fresh.aclose(logout=True)
