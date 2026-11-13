from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import Depends
from pydantic import BaseModel, ConfigDict
from sigaa_client import CurriculumWorkload, UserLevel
from sqlalchemy.ext.asyncio import AsyncSession

from api.cache import Freshness, freshness
from api.db.models import User
from api.modules.me.repository import UserRepository
from api.modules.recommendations.repository import RecommendationRepository
from api.schemas import CourseRef, UnitRef, course_ref, unit_ref
from api.sync import Cached, Context, SyncDep

PROFILE_TTL = timedelta(hours=12)


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
    curriculum_subject_codes: list[str] | None = None
    integralization: int | None
    workload: CurriculumWorkload | None
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
                await _to_profile(session, user),
                user.profile_synced_at,
                profile_freshness(user.profile_synced_at),
            )

        return await self._sync.resolve(sync_profile, None, load)


async def _to_profile(session: AsyncSession, user: User) -> UserProfile:
    assert user.registration and user.level
    codes = (
        sorted(await RecommendationRepository(session).components(user.curriculum_id))
        if user.curriculum_id is not None
        else None
    )
    return UserProfile(
        name=user.name,
        registration=user.registration,
        photo=user.photo,
        email=user.email,
        bio=user.bio,
        unit=unit_ref(user.course.unit) if user.course else None,
        course=course_ref(user.course),
        entry_semester=user.entry_semester,
        curriculum_subject_codes=codes,
        integralization=user.integralization,
        workload=CurriculumWorkload.model_validate(user.workload)
        if user.workload
        else None,
        period_max_workload=user.curriculum.period_max_workload
        if user.curriculum
        else None,
        ira=user.ira,
        mp=user.mp,
        level=UserLevel(user.level.value),
    )


ProfileServiceDep = Annotated[ProfileService, Depends()]
