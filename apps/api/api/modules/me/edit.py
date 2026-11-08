from datetime import UTC, datetime

from api.db.main import Database
from api.modules.me.profile import UserProfile, _to_profile
from api.modules.me.repository import UserRepository
from api.sigaa import SigaaConnection


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
        profile = await client.profile.update_profile(
            password=connection.credentials.password.get_secret_value(),
            bio=bio,
            photo=photo,
            remove_photo=remove_photo,
        )
        synced_at = datetime.now(UTC)

        async def save(session):
            user = await UserRepository(session).save_profile(
                profile,
                synced_at,
                login=connection.registration,
                replace_photo=remove_photo or photo is not None,
            )
            await session.refresh(user, ["course", "curriculum"])
            return _to_profile(user)

        return await db.write(save)
    finally:
        await fresh.aclose(logout=True)
