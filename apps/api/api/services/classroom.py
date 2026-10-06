from dataclasses import replace
from datetime import datetime
from functools import partial
from typing import Annotated

from fastapi import Depends, HTTPException, status
from pydantic import ValidationError
from sigaa_client import (
    Classroom,
    ClassroomFrequency,
    ClassroomMember,
    ClassroomNotFound,
    ClassroomRole,
    StatisticsShare,
    StudentSituation,
    Subject,
)
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.models import ClassroomUser
from api.dependencies.cache import NO_DIRECTIVES, CacheControl
from api.dependencies.sync import SyncEngineDep
from api.repositories.classroom import ClassroomRepository
from api.repositories.user import UserRepository
from api.services.sync import CLASSROOMS_TTL, Cached, Task, details_ttl, is_stale

_SITUATIONS = list(StudentSituation)


class ClassroomFrequencyResult(ClassroomFrequency):
    classroom: Classroom


class ClassroomService:
    def __init__(self, engine: SyncEngineDep) -> None:
        self._engine = engine

    async def list_classrooms(
        self, semester: str | None = None, cache: CacheControl = NO_DIRECTIVES
    ) -> list[Classroom]:
        async def load(session: AsyncSession) -> Cached[list[Classroom]]:
            users = UserRepository(session)
            user = await users.get_by_registration(self._engine.registration)
            synced_at = user.classrooms_synced_at if user else None
            if user is None or synced_at is None:
                return Cached(None)
            links = await ClassroomRepository(session).list_by_user_id(user.id)
            return Cached(
                [_to_classroom(link) for link in links], synced_at, CLASSROOMS_TTL
            )

        classrooms = await self._engine.resolve(Task.CLASSROOMS, load, cache=cache)
        selected = [c for c in classrooms if _in_semester(c, semester)]
        selected.sort(key=lambda c: (c.subject.name, c.number))

        return sorted(selected, key=lambda c: c.semester, reverse=True)

    async def list_members(
        self, classroom_id: str, cache: CacheControl = NO_DIRECTIVES
    ) -> list[ClassroomMember]:
        link = await self.get_link(classroom_id, cache)

        async def load(session: AsyncSession) -> Cached[list[ClassroomMember]]:
            repository = ClassroomRepository(session)
            classroom = await repository.get(link.classroom_id)
            synced_at = classroom.members_synced_at if classroom else None
            if synced_at is None:
                return Cached(None)
            members = await repository.list_members(link.classroom_id)
            return Cached(
                [_to_member(member) for member in members],
                synced_at,
                details_ttl(link.current),
            )

        members = await self._engine.resolve(Task.MEMBERS, load, link=link, cache=cache)

        return sorted(
            members, key=lambda m: (m.role != ClassroomRole.PROFESSOR, m.name)
        )

    async def list_statistics(
        self, classroom_id: str, cache: CacheControl = NO_DIRECTIVES
    ) -> list[StatisticsShare]:
        link = await self.get_link(classroom_id, cache)

        async def load(session: AsyncSession) -> Cached[list[StatisticsShare]]:
            repository = ClassroomRepository(session)
            classroom = await repository.get(link.classroom_id)
            synced_at = classroom.statistics_synced_at if classroom else None
            if synced_at is None:
                return Cached(None)
            statistics = await repository.get_statistics(link.classroom_id)
            if statistics is None:
                return Cached(None)
            return Cached(
                [StatisticsShare.model_validate(share) for share in statistics.data],
                synced_at,
                details_ttl(link.current),
            )

        shares = await self._engine.resolve(
            Task.STATISTICS, load, link=link, cache=cache
        )

        return sorted(shares, key=lambda s: _SITUATIONS.index(s.situation))

    async def get_frequency(
        self, classroom_id: str, cache: CacheControl = NO_DIRECTIVES
    ) -> ClassroomFrequency:
        link = await self.get_link(classroom_id, cache)

        async def load(session: AsyncSession) -> Cached[ClassroomFrequency]:
            cached = await ClassroomRepository(session).get_frequency(link.id)
            if cached is None:
                return Cached(None)
            try:
                frequency = ClassroomFrequency.model_validate(cached.data)
            except ValidationError:
                return Cached(None)
            return Cached(frequency, cached.synced_at, details_ttl(link.current))

        try:
            return await self._engine.resolve(
                Task.FREQUENCY, load, link=link, cache=cache
            )
        except ClassroomNotFound:
            raise classroom_not_found()

    async def list_frequencies(
        self, cache: CacheControl = NO_DIRECTIVES
    ) -> list[ClassroomFrequencyResult]:
        classrooms = await self.list_classrooms(cache=cache)
        result = []
        for classroom in classrooms:
            frequency = await self.get_frequency(classroom.id, cache)
            result.append(
                ClassroomFrequencyResult(
                    classroom=classroom,
                    progress=frequency.progress,
                    frequency=frequency.frequency,
                )
            )
        return result

    async def get_link(self, classroom_id: str, cache: CacheControl) -> ClassroomUser:
        """O vínculo pelo `Classroom.id` ou pelo `sigaa_id` da turma."""
        find = partial(self._find_link, classroom_id)
        link, synced_at = await self._engine.read(find)
        if link is None:
            await self.list_classrooms(
                cache=replace(cache, no_cache=True, response=None)
            )
            link, _ = await self._engine.read(find)
        elif is_stale(synced_at, CLASSROOMS_TTL):
            # A lista é o que dá acesso à turma: vencida, revalida como a listagem.
            await self._engine.schedule(Task.CLASSROOMS)
        if link is None:
            raise classroom_not_found()

        return link

    async def _find_link(
        self, classroom_id: str, session: AsyncSession
    ) -> tuple[ClassroomUser | None, datetime | None]:
        """O vínculo com a turma e quando a lista de turmas foi sincronizada."""
        user = await UserRepository(session).get_by_registration(
            self._engine.registration
        )
        if user is None:
            return None, None

        repository = ClassroomRepository(session)
        link = await repository.get_by_front_end_id(
            user.id, classroom_id
        ) or await repository.get_by_sigaa_id(user.id, classroom_id)
        return link, user.classrooms_synced_at


def _in_semester(classroom: Classroom, semester: str | None) -> bool:
    if semester is None:
        return classroom.current

    return semester == "all" or classroom.semester == semester


def _to_classroom(link: ClassroomUser) -> Classroom:
    assert link.front_end_id is not None
    classroom = link.classroom
    subject = classroom.subject

    return Classroom(
        id=link.front_end_id,
        sigaa_id=classroom.sigaa_id,
        number=classroom.number,
        semester=classroom.semester,
        schedule=classroom.schedule,
        room=classroom.room,
        current=link.current,
        subject=Subject(
            code=subject.code,
            sigaa_id=subject.sigaa_id,
            name=subject.name,
            hours=subject.hours,
            unity=subject.unity,
        ),
    )


def _to_member(link: ClassroomUser) -> ClassroomMember:
    user = link.user

    return ClassroomMember(
        name=user.name,
        role=ClassroomRole(link.role.value),
        registration=user.registration,
        photo=user.photo,
        email=user.email,
        course=user.course,
        unity=user.unity,
        person_id=user.person_id,
    )


def classroom_not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND, detail="Classroom not found"
    )


ClassroomServiceDep = Annotated[ClassroomService, Depends()]
