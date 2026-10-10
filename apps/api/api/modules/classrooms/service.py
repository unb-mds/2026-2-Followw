from datetime import UTC, datetime, timedelta
from functools import partial
from typing import Annotated

from fastapi import Depends
from pydantic import BaseModel, ConfigDict
from sigaa_client import (
    Classroom,
    ClassroomMember,
    ClassroomNotFound,
    ClassroomRole,
    Grade,
    StatisticsShare,
    StudentSituation,
)
from sqlalchemy.ext.asyncio import AsyncSession

from api import academic_calendar
from api.cache import Freshness, freshness
from api.db.models import ClassroomParticipant, OwnLink, User
from api.modules.classrooms.repository import ClassroomRepository
from api.modules.me.profile import sync_profile
from api.modules.me.repository import UserRepository
from api.sync import Cached, Context, SyncDep
from api.sync.engine import Task

CLASSROOMS_TTL = timedelta(hours=72)
# Detalhes das turmas atuais; os de semestres passados não mudam.
DETAILS_TTL = timedelta(hours=24)

_SITUATIONS = list(StudentSituation)


def details_ttl(link: OwnLink) -> timedelta | None:
    return DETAILS_TTL if link.row.current else None


def classrooms_freshness(synced_at: datetime | None) -> Freshness:
    return freshness(synced_at, CLASSROOMS_TTL)


def members_freshness(link: OwnLink, synced_at: datetime | None) -> Freshness:
    semester = link.row.classroom.semester
    if synced_at is not None and academic_calendar.members_frozen(semester, synced_at):
        return Freshness.FROZEN
    if academic_calendar.members_closed(semester):
        # Passada a tolerância do semestre, a lista vence até um sync depois dela.
        return Freshness.STALE
    return freshness(synced_at, details_ttl(link))


def statistics_freshness(synced_at: datetime | None) -> Freshness:
    # Só `no-cache` revalida: a estatística de uma turma encerrada não muda.
    return freshness(synced_at, None)


def grade_freshness(link: OwnLink, synced_at: datetime | None) -> Freshness:
    semester = link.row.classroom.semester
    if synced_at is not None and academic_calendar.grades_frozen(semester, synced_at):
        return Freshness.FROZEN
    if academic_calendar.grades_closed(semester):
        return Freshness.STALE
    return freshness(synced_at, DETAILS_TTL)


def stale_classroom_tasks(link: OwnLink) -> list[Task[OwnLink]]:
    """As telas da turma que o sync do login revalida."""
    classroom = link.row.classroom
    stale: list[Task[OwnLink]] = []
    if members_freshness(link, classroom.members_synced_at) is Freshness.STALE:
        stale.append(sync_members)
    if (
        not link.row.current
        and statistics_freshness(classroom.statistics_synced_at) is Freshness.STALE
    ):
        stale.append(sync_statistics)
    if grade_freshness(link, link.row.grade_synced_at) is Freshness.STALE:
        stale.append(sync_grade)
    return stale


async def sync_classrooms(ctx: Context[None]) -> None:
    classrooms = await ctx.client.classrooms.list_classrooms()
    registration = ctx.sync.registration
    if await ctx.sync.db.read(partial(_user, registration)) is None:
        # As turmas penduram no usuário: sem perfil no cache, ele vem antes.
        await sync_profile(ctx)

    async def write(session: AsyncSession) -> None:
        user = await _user(registration, session)
        assert user is not None
        await ClassroomRepository(session).save_classroom_participants(
            user, classrooms, datetime.now(UTC), refresh=ctx.refresh
        )

    await ctx.sync.db.write(write)


async def sync_members(ctx: Context[OwnLink]) -> None:
    link = ctx.target
    members = await ctx.client.classrooms.list_classroom_members(link.front_end_id)
    await ctx.sync.db.write(
        lambda session: ClassroomRepository(session).save_members(
            link.row.classroom_id, members, datetime.now(UTC)
        )
    )


async def sync_statistics(ctx: Context[OwnLink]) -> None:
    link = ctx.target
    shares = await ctx.client.classrooms.get_classroom_statistics(link.front_end_id)
    await ctx.sync.db.write(
        lambda session: ClassroomRepository(session).save_statistics(
            link.row.classroom_id, shares, datetime.now(UTC)
        )
    )


async def sync_grade(ctx: Context[OwnLink]) -> None:
    link = ctx.target
    grade = await ctx.client.classrooms.get_classroom_grade(link.front_end_id)
    await ctx.sync.db.write(
        lambda session: ClassroomRepository(session).save_grade(
            link.row.id, grade, datetime.now(UTC)
        )
    )


class UserSubject(BaseModel):
    """O componente como o cache guarda, pelo código."""

    model_config = ConfigDict(frozen=True)

    code: str
    name: str
    hours: int | None = None
    unity: str | None = None


class ParticipantClassroom(Classroom):
    """A turma com a menção do usuário, `None` enquanto não lançada ou sincronizada."""

    subject: UserSubject
    grade: Grade | None = None


class ClassroomService:
    def __init__(self, sync: SyncDep) -> None:
        self._sync = sync

    async def list_classrooms(
        self, semester: str | None = None
    ) -> list[ParticipantClassroom]:
        """A menção sai do cache: quem a revalida é o sync do login."""
        return [to_classroom(link) for link in await self.list_links(semester)]

    async def list_links(self, semester: str | None = None) -> list[OwnLink]:
        """Os vínculos da lista de turmas, na ordem em que ela é exibida."""

        async def load(session: AsyncSession) -> Cached[list[OwnLink]] | None:
            user = await _user(self._sync.registration, session)
            if user is None or user.classrooms_synced_at is None:
                return None
            return Cached(
                await ClassroomRepository(session).list_by_user_id(user.id),
                user.classrooms_synced_at,
                classrooms_freshness(user.classrooms_synced_at),
            )

        links = await self._sync.resolve(sync_classrooms, None, load)
        selected = [link for link in links if _in_semester(link, semester)]
        selected.sort(
            key=lambda link: (
                link.row.classroom.subject.name,
                link.row.classroom.number,
            )
        )

        return sorted(
            selected, key=lambda link: link.row.classroom.semester, reverse=True
        )

    async def list_members(self, classroom_id: str) -> list[ClassroomMember]:
        link = await self.get_link(classroom_id)

        async def load(session: AsyncSession) -> Cached[list[ClassroomMember]] | None:
            repository = ClassroomRepository(session)
            classroom = await repository.get(link.row.classroom_id)
            if classroom is None or classroom.members_synced_at is None:
                return None
            members = await repository.list_members(link.row.classroom_id)
            return Cached(
                [_to_member(member) for member in members],
                classroom.members_synced_at,
                members_freshness(link, classroom.members_synced_at),
            )

        members = await self._sync.resolve(sync_members, link, load)

        return sorted(
            members, key=lambda m: (m.role != ClassroomRole.PROFESSOR, m.name)
        )

    async def list_statistics(self, classroom_id: str) -> list[StatisticsShare]:
        link = await self.get_link(classroom_id)

        async def load(session: AsyncSession) -> Cached[list[StatisticsShare]] | None:
            repository = ClassroomRepository(session)
            classroom = await repository.get(link.row.classroom_id)
            statistics = await repository.get_statistics(link.row.classroom_id)
            if (
                classroom is None
                or classroom.statistics_synced_at is None
                or statistics is None
            ):
                return None
            return Cached(
                [StatisticsShare.model_validate(share) for share in statistics.data],
                classroom.statistics_synced_at,
                statistics_freshness(classroom.statistics_synced_at),
            )

        shares = await self._sync.resolve(sync_statistics, link, load)

        return sorted(shares, key=lambda s: _SITUATIONS.index(s.situation))

    async def get_link(self, classroom_id: str) -> OwnLink:
        """O vínculo pelo `Classroom.id` ou pelo `sigaa_id` da turma."""
        find = partial(find_link, self._sync.registration, classroom_id)
        link, synced_at = await self._sync.db.read(find)
        if link is None:
            # Turma nova ainda fora do cache: relê a lista antes de recusar.
            await self._sync.perform(sync_classrooms, None)
            link, _ = await self._sync.db.read(find)
        elif classrooms_freshness(synced_at) is Freshness.STALE:
            # A lista é o que dá acesso à turma: vencida, revalida como a listagem.
            self._sync.schedule(sync_classrooms, None)
        if link is None:
            raise ClassroomNotFound(f"Turma `{classroom_id}` não é do usuário.")

        return link


async def find_link(
    registration: str, classroom_id: str, session: AsyncSession
) -> tuple[OwnLink | None, datetime | None]:
    """O vínculo com a turma e quando a lista de turmas foi sincronizada."""
    user = await _user(registration, session)
    if user is None:
        return None, None

    repository = ClassroomRepository(session)
    link = await repository.get_by_front_end_id(
        user.id, classroom_id
    ) or await repository.get_by_sigaa_id(user.id, classroom_id)
    return link, user.classrooms_synced_at


async def _user(registration: str, session: AsyncSession) -> User | None:
    return await UserRepository(session).get_by_registration(registration)


def _in_semester(link: OwnLink, semester: str | None) -> bool:
    if semester is None:
        return link.row.current

    return semester == "all" or link.row.classroom.semester == semester


def to_classroom(link: OwnLink) -> ParticipantClassroom:
    classroom = link.row.classroom
    subject = classroom.subject

    return ParticipantClassroom(
        id=link.front_end_id,
        sigaa_id=classroom.sigaa_id,
        number=classroom.number,
        semester=classroom.semester,
        schedule=classroom.schedule,
        room=classroom.room,
        current=link.row.current,
        subject=UserSubject(
            code=subject.code,
            name=subject.name,
            hours=subject.hours,
            unity=subject.unity.code if subject.unity else None,
        ),
        grade=link.row.grade,
    )


def _to_member(link: ClassroomParticipant) -> ClassroomMember:
    user = link.user

    return ClassroomMember(
        name=user.name,
        role=ClassroomRole(link.role.value),
        registration=user.registration,
        photo=user.photo,
        email=user.email,
        course=user.course.name if user.course else None,
        unity=user.course.unity.code if user.course else None,
        person_id=user.person_id,
    )


ClassroomServiceDep = Annotated[ClassroomService, Depends()]
