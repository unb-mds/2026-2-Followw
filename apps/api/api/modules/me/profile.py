from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import Depends
from pydantic import BaseModel, ConfigDict
from sigaa_client import CurriculumWorkload, UserLevel
from sqlalchemy.ext.asyncio import AsyncSession

from api.cache import Freshness, freshness
from api.db.models import User
from api.modules.me.repository import UserRepository
from api.schemas import CourseRef, UnitRef, course_ref, unit_ref
from api.sync import Cached, Context, SyncDep

PROFILE_TTL = timedelta(hours=12)


class Workload(CurriculumWorkload):
    # Carga exigida por categoria na matriz do aluno.
    mandatory: int | None
    optional: int | None
    complementary: int | None


class UserProfile(BaseModel):
    """Perfil acadêmico do usuário."""

    model_config = ConfigDict(frozen=True)

    name: str
    registration: str
    photo: str | None
    email: str | None = None
    bio: str | None
    unit: UnitRef | None
    course: CourseRef | None
    entry_semester: str | None
    integralization: int | None
    workload: Workload | None
    # Carga horária máxima por período da matriz do aluno, em horas.
    period_max_workload: int | None
    ira: float | None
    mp: float | None
    level: UserLevel


def profile_freshness(synced_at: datetime | None) -> Freshness:
    return freshness(synced_at, PROFILE_TTL)


async def sync_profile(ctx: Context[None]) -> None:
    started_at = datetime.now(UTC)
    profile = await ctx.client.profile.get_profile()
    await ctx.sync.db.write(
        lambda session: UserRepository(session).save_profile(
            profile, started_at, login=ctx.sync.registration
        )
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
        unit=unit_ref(user.course.unit) if user.course else None,
        course=course_ref(user.course),
        entry_semester=user.entry_semester,
        integralization=user.integralization,
        workload=_workload(user),
        period_max_workload=user.curriculum.period_max_workload
        if user.curriculum
        else None,
        ira=user.ira,
        mp=user.mp,
        level=UserLevel(user.level.value),
    )


def _workload(user: User) -> Workload | None:
    if not user.workload:
        return None
    curriculum = user.curriculum
    return Workload(
        **CurriculumWorkload.model_validate(user.workload).model_dump(),
        mandatory=curriculum and curriculum.required_workload,
        optional=curriculum and curriculum.optional_min_workload,
        complementary=curriculum and curriculum.complementary_min_workload,
    )


ProfileServiceDep = Annotated[ProfileService, Depends()]
