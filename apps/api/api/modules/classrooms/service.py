from datetime import UTC, datetime, timedelta
from functools import partial
from typing import Annotated

from fastapi import Depends
from pydantic import BaseModel, ConfigDict
from sigaa_client import (
    Classroom,
    ClassroomNotFound,
    Grade,
    StatisticsShare,
)
from sqlalchemy.ext.asyncio import AsyncSession

from api import academic_calendar
from api.cache import Freshness, freshness
from api.db.enums import ClassroomRole, ClassroomStatus
from api.db.models import ClassroomParticipant, OwnLink, User
from api.modules.classrooms.repository import ClassroomRepository
from api.modules.me.profile import sync_profile
from api.modules.me.repository import UserRepository
from api.schemas import (
    ClassroomOffer,
    CourseRef,
    ProfessorRef,
    UnitRef,
    UserSubject,
    course_ref,
    professor_refs,
    unit_ref,
)
from api.sync import Cached, Context, SyncDep
from api.sync.engine import Task

CLASSROOMS_TTL = timedelta(hours=72)
# Detalhes das turmas atuais; os de semestres passados não mudam.
DETAILS_TTL = timedelta(hours=24)


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


def grades_freshness(synced_at: datetime | None) -> Freshness:
    # Não congela: a menção pode chegar ao relatório depois da consolidação.
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


async def sync_grades(ctx: Context[None]) -> None:
    grades = await ctx.client.classrooms.list_grades()

    async def write(session: AsyncSession) -> None:
        user = await _user(ctx.sync.registration, session)
        assert user is not None
        await ClassroomRepository(session).save_grades(user, grades, datetime.now(UTC))

    await ctx.sync.db.write(write)


class ClassroomMember(BaseModel):
    model_config = ConfigDict(frozen=True)

    name: str
    registration: str
    photo: str | None = None
    email: str | None = None
    course: CourseRef | None = None
    unit: UnitRef | None = None


class ClassroomMembers(BaseModel):
    model_config = ConfigDict(frozen=True)

    students: list[ClassroomMember]
    monitors: list[ClassroomMember]
    professors: list[ProfessorRef]


class ParticipantClassroom(Classroom, ClassroomOffer):
    """A turma com a menção do usuário, `None` enquanto não lançada ou sincronizada."""

    subject: UserSubject
    grade: Grade | None = None
    status: ClassroomStatus | None = None


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

    async def list_members(self, classroom_id: str) -> ClassroomMembers:
        link = await self.get_link(classroom_id)

        async def load(session: AsyncSession) -> Cached[ClassroomMembers] | None:
            repository = ClassroomRepository(session)
            classroom = await repository.get(link.row.classroom_id)
            if classroom is None or classroom.members_synced_at is None:
                return None
            links = await repository.list_members(link.row.classroom_id)
            return Cached(
                ClassroomMembers(
                    students=_members(links, ClassroomRole.ALUNO),
                    monitors=_members(links, ClassroomRole.MONITOR),
                    professors=list(professor_refs(classroom.professors)),
                ),
                classroom.members_synced_at,
                members_freshness(link, classroom.members_synced_at),
            )

        return await self._sync.resolve(sync_members, link, load)

    async def get_statistics(self, classroom_id: str) -> list[StatisticsShare]:
        link = await self.get_link(classroom_id)
        if link.row.current:
            return []

        async def load(session: AsyncSession) -> Cached[list[StatisticsShare]] | None:
            classroom = await ClassroomRepository(session).get_statistics(
                link.row.classroom_id
            )
            if classroom is None or classroom.statistics_synced_at is None:
                return None
            return Cached(
                [
                    StatisticsShare.model_validate(share)
                    for share in classroom.statistics or []
                ],
                classroom.statistics_synced_at,
                statistics_freshness(classroom.statistics_synced_at),
            )

        return await self._sync.resolve(sync_statistics, link, load)

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
            unit=unit_ref(subject.unit),
        ),
        grade=link.row.grade,
        status=link.row.status,
        professors=professor_refs(classroom.professors),
        vacancies=classroom.vacancies,
        occupied=classroom.occupied,
    )


def _members(
    links: list[ClassroomParticipant], role: ClassroomRole
) -> list[ClassroomMember]:
    users = [link.user for link in links if link.role == role]
    return [_to_member(user) for user in sorted(users, key=lambda u: u.name)]


def _to_member(user: User) -> ClassroomMember:
    assert user.registration is not None, "participante sem matrícula"
    return ClassroomMember(
        name=user.name,
        registration=user.registration,
        photo=user.photo,
        email=user.email,
        course=course_ref(user.course),
        unit=unit_ref(user.course.unit) if user.course else None,
    )


ClassroomServiceDep = Annotated[ClassroomService, Depends()]
