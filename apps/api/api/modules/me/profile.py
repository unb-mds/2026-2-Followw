from datetime import UTC, datetime, timedelta
from typing import Annotated

import sigaa_client
from fastapi import Depends
from sigaa_client import CurriculumWorkload, UserLevel
from sqlalchemy.ext.asyncio import AsyncSession

from api.cache import Freshness, freshness
from api.db.models import User
from api.modules.me.repository import UserRepository
from api.sync import Cached, Context, SyncDep

PROFILE_TTL = timedelta(hours=24)


class UserProfile(sigaa_client.UserProfile):
    """O perfil como a API devolve: sem curso na tabela, `course` e `unity` são nulos."""

    course: str | None
    shift: str | None
    unity: str | None


def profile_freshness(synced_at: datetime | None) -> Freshness:
    return freshness(synced_at, PROFILE_TTL)


async def sync_profile(ctx: Context[None]) -> None:
    profile = await ctx.client.profile.get_profile()
    await ctx.sync.db.write(
        lambda session: UserRepository(session).save_profile(profile, datetime.now(UTC))
    )


class ProfileService:
    def __init__(self, sync: SyncDep) -> None:
        self._sync = sync

    async def get_profile(self) -> UserProfile:
        async def load(session: AsyncSession) -> Cached[UserProfile] | None:
            users = UserRepository(session)
            user = await users.get_by_registration(self._sync.registration)
            if user is None or user.profile_synced_at is None:
                return None
            return Cached(
                _to_profile(user),
                user.profile_synced_at,
                profile_freshness(user.profile_synced_at),
            )

        return await self._sync.resolve(sync_profile, None, load)


def _to_profile(user: User) -> UserProfile:
    assert user.registration and user.level
    return UserProfile(
        name=user.name,
        registration=user.registration,
        photo=user.photo,
        email=user.email,
        bio=user.bio,
        unity=user.course.unity.code if user.course else None,
        course=user.course.name if user.course else None,
        shift=user.course.shift if user.course else None,
        integralization=user.integralization,
        workload=CurriculumWorkload.model_validate(user.workload)
        if user.workload
        else None,
        ira=user.ira,
        mp=user.mp,
        level=UserLevel(user.level.value),
    )


ProfileServiceDep = Annotated[ProfileService, Depends()]
