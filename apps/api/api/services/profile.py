from typing import Annotated

from fastapi import Depends
from sigaa_client import UserLevel, UserProfile
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.models import User
from api.dependencies.sync import SyncEngineDep
from api.repositories.user import UserRepository
from api.services.sync import PROFILE_TTL, Task, is_stale


class ProfileService:
    def __init__(self, engine: SyncEngineDep) -> None:
        self._engine = engine

    async def get_profile(self, *, refresh: bool = False) -> UserProfile:
        async def load(session: AsyncSession) -> tuple[UserProfile | None, bool]:
            users = UserRepository(session)
            user = await users.get_by_registration(self._engine.registration)
            synced_at = user.profile_synced_at if user else None
            cached = _to_profile(user) if user and synced_at else None
            return cached, is_stale(synced_at, PROFILE_TTL)

        return await self._engine.resolve(Task.PROFILE, load, refresh=refresh)


def _to_profile(user: User) -> UserProfile:
    assert user.registration and user.unity and user.course and user.level
    return UserProfile(
        name=user.name,
        registration=user.registration,
        photo=user.photo,
        email=user.email,
        bio=user.bio,
        unity=user.unity,
        course=user.course,
        integralization=user.integralization,
        ira=user.ira,
        mp=user.mp,
        level=UserLevel(user.level.value),
    )


ProfileServiceDep = Annotated[ProfileService, Depends()]
