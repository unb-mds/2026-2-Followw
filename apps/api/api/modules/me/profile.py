import logging
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import Depends
from httpx import HTTPError
from pydantic import BaseModel, ConfigDict
from sigaa_client import (
    CurriculumWorkload,
    DocumentUnavailable,
    SigaaParseError,
    TranscriptCompletion,
    UserLevel,
)
from sqlalchemy.ext.asyncio import AsyncSession

from api.cache import Freshness, freshness
from api.db.models import User
from api.modules.me.repository import UserRepository
from api.modules.me.transcript import TranscriptRepository
from api.modules.recommendations.ranking import equivalent_codes
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
    curriculum_sigaa_id: int | None = None
    official_curriculum_code: str | None = None
    curriculum_subject_codes: list[str] | None = None
    completed_subjects: dict[str, TranscriptCompletion] | None = None
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
    transcript = None
    if profile.level == UserLevel.GRADUACAO:
        try:
            document = await ctx.client.documents.get_transcript()
            if document.registration == profile.registration:
                transcript = document
            else:
                logger.warning(
                    "Matrícula do histórico não confere com o perfil do SIGAA."
                )
        except DocumentUnavailable:
            pass
        except (HTTPError, SigaaParseError) as error:
            logger.warning(
                "Histórico acadêmico do SIGAA indisponível (%s).", type(error).__name__
            )
    await ctx.sync.db.write(
        lambda session: UserRepository(session).save_profile(
            profile, started_at, login=ctx.sync.registration, transcript=transcript
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
    transcripts = TranscriptRepository(session)
    official = await transcripts.curriculum_code(user.id)
    repository = RecommendationRepository(session)
    codes = (
        sorted(await repository.components(user.curriculum_id))
        if user.curriculum_id is not None
        else None
    )
    completed = None
    if official is not None and codes is not None:
        direct = await transcripts.completed(user.id)
        completed = {code: direct[code] for code in codes if code in direct}
        if direct:
            catalog = await repository.catalog(set(codes) - direct.keys())
            evidence = {code for code, kind in direct.items() if kind != "equivalence"}
            for code in sorted(equivalent_codes(catalog, evidence)):
                completed[code] = "equivalence"
    return UserProfile(
        name=user.name,
        registration=user.registration,
        photo=user.photo,
        email=user.email,
        bio=user.bio,
        unit=unit_ref(user.course.unit) if user.course else None,
        course=course_ref(user.course),
        entry_semester=user.entry_semester,
        curriculum_sigaa_id=user.curriculum.sigaa_id if user.curriculum else None,
        official_curriculum_code=official,
        curriculum_subject_codes=codes,
        completed_subjects=completed,
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
