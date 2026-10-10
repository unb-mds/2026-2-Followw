from datetime import datetime

from sigaa_client import UserProfile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.courses import course_ids
from api.db.enums import UserLevel
from api.db.models import User


class UserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_registration(self, registration: str) -> User | None:
        return await self._session.scalar(
            select(User).where(User.registration == registration)
        )

    async def save_profile(self, profile: UserProfile, synced_at: datetime) -> User:
        """Grava o perfil, assumindo o usuário sombra de mesma matrícula se houver."""
        user = await self.get_by_registration(profile.registration)
        if user is None:
            user = User(registration=profile.registration)
            self._session.add(user)

        user.name = profile.name
        user.photo = profile.photo or user.photo
        user.email = profile.email or user.email
        user.bio = profile.bio
        pair = (profile.course, profile.unity)
        shift = profile.shift.value if profile.shift else None
        user.course_id = (await course_ids(self._session, [pair], shift)).get(pair)
        user.integralization = profile.integralization
        user.workload = profile.workload.model_dump() if profile.workload else None
        user.ira = profile.ira
        user.mp = profile.mp
        user.level = UserLevel(profile.level.value)
        user.profile_synced_at = synced_at
        await self._session.flush()

        return user

    async def get_settings(self, registration: str) -> dict[str, object]:
        user = await self.get_by_registration(registration)
        if user is None or not user.settings:
            return {}
        return dict(user.settings)

    async def update_settings(
        self, registration: str, patch: dict[str, object]
    ) -> dict[str, object]:
        user = await self.get_by_registration(registration)
        if user is None:
            user = User(registration=registration, name="", settings={})
            self._session.add(user)
        current = dict(user.settings or {})
        current.update(patch)
        user.settings = current
        await self._session.flush()
        return user.settings
