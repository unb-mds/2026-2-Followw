from datetime import UTC, datetime
from typing import Any

from sigaa_client import ProfileReadFailedAfterEdit

from api.db.main import Database
from api.modules.me.profile import UserProfile, profile_view
from api.modules.me.repository import UserRepository
from api.sigaa import SigaaConnection


async def edit_profile(
    connection: SigaaConnection,
    db: Database,
    *,
    bio: str | None,
    photo: bytes | None,
    remove_photo: bool,
) -> UserProfile | dict[str, Any]:
    fresh = SigaaConnection(connection.credentials)
    try:
        client = await fresh.client()
        registration = connection.registration
        cached = await db.read(
            lambda session: UserRepository(session).get_by_registration(registration)
        )
        if cached is None or cached.profile_synced_at is None:
            started_at = datetime.now(UTC)
            initial = await client.profile.get_profile()
            await db.write(
                lambda session: UserRepository(session).save_profile(
                    initial, started_at, login=registration
                )
            )

        try:
            profile = await client.profile.update_profile(
                password=connection.credentials.password.get_secret_value(),
                bio=bio,
                photo=photo,
                remove_photo=remove_photo,
            )
        except ProfileReadFailedAfterEdit as error:
            confirmed = error

            async def save_confirmed(session):
                user = await UserRepository(session).save_cached_profile_edit(
                    registration,
                    confirmed.confirmed_at,
                    photo=confirmed.photo,
                    bio=confirmed.bio,
                    update_photo=photo is not None or remove_photo,
                    update_bio=bio is not None,
                )
                return (
                    await profile_view(session, user, connection.access)
                    if user is not None
                    else None
                )

            saved = await db.write(save_confirmed)
            if saved is None:
                raise
            return saved

        synced_at = datetime.now(UTC)

        async def save(session):
            user = await UserRepository(session).save_profile(
                profile,
                synced_at,
                login=registration,
            )
            await session.refresh(user, ["course", "curriculum"])
            return await profile_view(session, user, connection.access)

        return await db.write(save)
    finally:
        await fresh.aclose(logout=True)
