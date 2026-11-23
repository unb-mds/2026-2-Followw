import logging
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import Depends
from httpx import HTTPError
from pydantic import BaseModel, ConfigDict, Field
from sigaa_client import (
    CurriculumWorkload,
    DocumentUnavailable,
    SigaaParseError,
    UserLevel,
)
from sqlalchemy.ext.asyncio import AsyncSession

from api.cache import Freshness, freshness
from api.db.models import User
from api.modules.me.repository import UserRepository
from api.modules.me.transcript import TranscriptRepository
from api.modules.oauth.scopes import Scope
from api.modules.recommendations.repository import RecommendationRepository
from api.schemas import CourseRef, UnitRef, course_ref, unit_ref
from api.sync import Cached, Context, SyncDep

PROFILE_TTL = timedelta(hours=12)
logger = logging.getLogger(__name__)


class Workload(CurriculumWorkload):
    # Carga exigida por categoria na matriz do aluno.
    mandatory: int | None
    optional: int | None
    complementary: int | None


class BasicProfile(BaseModel):
    model_config = ConfigDict(frozen=True)

    name: str
    registration: str
    photo: str | None
    course: CourseRef | None


class AcademicProfile(BasicProfile):
    ira: float | None
    mp: float | None


class UserProfile(AcademicProfile):
    """Perfil acadêmico do usuário."""

    email: str | None = None
    bio: str | None
    unit: UnitRef | None
    entry_semester: str | None
    curriculum_subject_codes: list[str] | None = None
    # Componentes CUMP do histórico, além das aprovações nas turmas.
    completed_subjects: list[str] = Field(default_factory=list)
    integralization: int | None
    workload: Workload | None
    # Carga horária máxima por período da matriz do aluno, em horas.
    period_max_workload: int | None
    level: UserLevel


ProfileResponse = UserProfile | AcademicProfile | BasicProfile


def profile_freshness(synced_at: datetime | None) -> Freshness:
    return freshness(synced_at, PROFILE_TTL)


async def sync_profile(ctx: Context[None]) -> None:
    started_at = datetime.now(UTC)
    profile = await ctx.client.profile.get_profile()
    user = await ctx.sync.db.write(
        lambda session: UserRepository(session).save_profile(
            profile, started_at, login=ctx.sync.registration
        )
    )
    if profile.level != UserLevel.GRADUACAO or user.transcript_synced_at is not None:
        return
    try:
        codes = await ctx.client.documents.get_completed_subjects(profile.registration)
    except DocumentUnavailable:
        return
    except (HTTPError, SigaaParseError) as error:
        logger.warning("Histórico acadêmico indisponível (%s).", type(error).__name__)
        return
    await ctx.sync.db.write(
        lambda session: TranscriptRepository(session).save(user.id, codes, started_at)
    )


class ProfileService:
    def __init__(self, sync: SyncDep) -> None:
        self._sync = sync

    async def get_profile(self) -> ProfileResponse:
        async def load(session: AsyncSession) -> Cached[ProfileResponse] | None:
            users = UserRepository(session)
            user = await users.get_by_registration(self._sync.registration)
            if user is None or user.profile_synced_at is None:
                return None
            return Cached(
                await profile_view(session, user, self._sync.scopes),
                user.profile_synced_at,
                profile_freshness(user.profile_synced_at),
            )

        return await self._sync.resolve(sync_profile, None, load)


async def profile_view(
    session: AsyncSession, user: User, scopes: frozenset[Scope] | None
) -> ProfileResponse:
    assert user.registration and user.level
    basic = BasicProfile(
        name=user.name,
        registration=user.registration,
        photo=user.photo,
        course=course_ref(user.course),
    )
    if scopes is not None and Scope.GRADES not in scopes:
        return basic
    academic = AcademicProfile(**basic.model_dump(), ira=user.ira, mp=user.mp)
    if scopes is not None:
        return academic
    codes = (
        sorted(await RecommendationRepository(session).components(user.curriculum_id))
        if user.curriculum_id is not None
        else None
    )
    return UserProfile(
        **academic.model_dump(),
        email=user.email,
        bio=user.bio,
        unit=unit_ref(user.course.unit) if user.course else None,
        entry_semester=user.entry_semester,
        curriculum_subject_codes=codes,
        completed_subjects=sorted(
            await TranscriptRepository(session).completed(user.id)
        ),
        integralization=user.integralization,
        workload=_workload(user),
        period_max_workload=user.curriculum.period_max_workload
        if user.curriculum
        else None,
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
