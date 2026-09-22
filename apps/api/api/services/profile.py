from typing import Annotated

from fastapi import Depends
from sigaa_client import UserLevel, UserProfile

from api.db.models import User
from api.repositories.user import UserRepositoryDep
from api.services.sync import PROFILE_TTL, SyncEngineDep, is_stale


class ProfileService:
    def __init__(self, users: UserRepositoryDep, engine: SyncEngineDep) -> None:
        self._users = users
        self._engine = engine

    async def get_profile(self, *, refresh: bool = False) -> UserProfile:
        user = await self._users.get_by_registration(self._engine.registration)
        synced_at = user.profile_synced_at if user else None
        return await self._engine.resolve(
            "profile",
            cached=_to_profile(user) if user and synced_at else None,
            stale=is_stale(synced_at, PROFILE_TTL),
            fetch=lambda client: client.profile.get_profile(),
            save=self._engine.save_profile,
            refresh=refresh,
        )


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
