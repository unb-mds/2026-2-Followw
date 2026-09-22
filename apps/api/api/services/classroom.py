from functools import partial
from typing import Annotated

from fastapi import Depends, HTTPException, status
from sigaa_client import (
    Classroom,
    ClassroomMember,
    ClassroomRole,
    SigaaClient,
    StatisticsShare,
    StudentSituation,
    Subject,
)

from api.db.models import ClassroomStatistic, ClassroomUser
from api.repositories.classroom import ClassroomRepositoryDep
from api.repositories.user import UserRepositoryDep
from api.services.sync import CLASSROOMS_TTL, SyncEngineDep, details_ttl, is_stale

_SITUATIONS = list(StudentSituation)


class ClassroomService:
    def __init__(
        self,
        users: UserRepositoryDep,
        classrooms: ClassroomRepositoryDep,
        engine: SyncEngineDep,
    ) -> None:
        self._users = users
        self._classrooms = classrooms
        self._engine = engine

    async def list_classrooms(
        self, semester: str | None = None, *, refresh: bool = False
    ) -> list[Classroom]:
        """Sem `semester`, as turmas atuais; `all` para todas ou um período `AAAA.P`."""
        user = await self._users.get_by_registration(self._engine.registration)
        synced_at = user.classrooms_synced_at if user else None
        cached = None
        if user and synced_at:
            links = await self._classrooms.list_by_user_id(user.id)
            cached = [_to_classroom(link) for link in links]

        classrooms = await self._engine.resolve(
            "classrooms",
            cached=cached,
            stale=is_stale(synced_at, CLASSROOMS_TTL),
            fetch=lambda client: client.classrooms.list_classrooms(),
            save=self._engine.save_classrooms,
            refresh=refresh,
        )
        selected = [c for c in classrooms if _in_semester(c, semester)]
        selected.sort(key=lambda c: (c.subject.name, c.number))

        return sorted(selected, key=lambda c: c.semester, reverse=True)

    async def list_members(
        self, classroom_id: str, *, refresh: bool = False
    ) -> list[ClassroomMember]:
        link = await self._link(classroom_id)
        classroom = link.classroom
        synced_at = classroom.members_synced_at
        cached = None
        if synced_at:
            members = await self._classrooms.list_members(classroom.id)
            cached = [_to_member(member) for member in members]

        members = await self._engine.resolve(
            f"members:{classroom.id}",
            cached=cached,
            stale=is_stale(synced_at, details_ttl(link.current)),
            fetch=lambda client: client.classrooms.list_classroom_members(classroom_id),
            save=partial(self._engine.save_members, classroom.id),
            refresh=refresh,
        )

        return sorted(
            members, key=lambda m: (m.role != ClassroomRole.PROFESSOR, m.name)
        )

    async def list_statistics(
        self, classroom_id: str, *, refresh: bool = False
    ) -> list[StatisticsShare]:
        link = await self._link(classroom_id)
        classroom = link.classroom
        synced_at = classroom.statistics_synced_at
        cached = None
        if synced_at:
            statistics = await self._classrooms.list_statistics(classroom.id)
            cached = [_to_share(statistic) for statistic in statistics]

        async def fetch(client: SigaaClient) -> list[StatisticsShare]:
            return list(await client.classrooms.get_classroom_statistics(classroom_id))

        shares = await self._engine.resolve(
            f"statistics:{classroom.id}",
            cached=cached,
            stale=is_stale(synced_at, details_ttl(link.current)),
            fetch=fetch,
            save=partial(self._engine.save_statistics, classroom.id),
            refresh=refresh,
        )

        return sorted(shares, key=lambda s: _SITUATIONS.index(s.situation))

    async def _link(self, classroom_id: str) -> ClassroomUser:
        user = await self._users.get_by_registration(self._engine.registration)
        if user is None or user.classrooms_synced_at is None:
            # Sem a lista de turmas no cache não dá para saber se a turma é dele.
            await self.list_classrooms(refresh=True)
            user = await self._users.get_by_registration(self._engine.registration)

        link = user and await self._classrooms.get_by_front_end_id(
            user.id, classroom_id
        )
        if link is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Classroom not found"
            )

        return link


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


def _to_share(statistic: ClassroomStatistic) -> StatisticsShare:
    return StatisticsShare(
        situation=StudentSituation(statistic.situation.value),
        percentage=statistic.percentage,
    )


ClassroomServiceDep = Annotated[ClassroomService, Depends()]
