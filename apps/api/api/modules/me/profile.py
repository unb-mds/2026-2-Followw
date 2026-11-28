import logging
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

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
from api.modules.oauth import redaction
from api.modules.oauth.scopes import AccessPolicy, Scope, scoped
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
    # Componentes aprovados ou cumpridos no histórico acadêmico.
    completed_subjects: list[str] = Field(default_factory=list)
    completed_subject_hours: dict[str, int | None] = Field(default_factory=dict)
    integralization: int | None
    workload: Workload | None
    # Carga horária máxima por período da matriz do aluno, em horas.
    period_max_workload: int | None
    ira: float | None = scoped(Scope.GRADES, "Índice de rendimento acadêmico.")
    mp: float | None = scoped(Scope.GRADES, "Média ponderada.")
    level: UserLevel


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
    if profile.level != UserLevel.GRADUACAO:
        return
    if (
        not ctx.refresh
        and profile_freshness(user.transcript_synced_at) is Freshness.FRESH
    ):
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

    async def get_profile(self) -> UserProfile | dict[str, Any]:
        async def load(
            session: AsyncSession,
        ) -> Cached[UserProfile | dict[str, Any]] | None:
            users = UserRepository(session)
            user = await users.get_by_registration(self._sync.registration)
            if user is None or user.profile_synced_at is None:
                return None
            return Cached(
                await profile_view(session, user, self._sync.access),
                user.profile_synced_at,
                profile_freshness(user.profile_synced_at),
            )

        return await self._sync.resolve(sync_profile, None, load)


async def profile_view(
    session: AsyncSession, user: User, access: AccessPolicy
) -> UserProfile | dict[str, Any]:
    assert user.registration and user.level
    if access.delegated:
        return redaction.profile(user, access)
    codes = (
        sorted(await RecommendationRepository(session).components(user.curriculum_id))
        if user.curriculum_id is not None
        else None
    )
    completed = await TranscriptRepository(session).completed_hours(user.id)
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
        completed_subjects=sorted(completed),
        completed_subject_hours=completed,
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
