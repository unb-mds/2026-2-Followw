from collections.abc import Sequence
from datetime import datetime
from typing import Annotated
from uuid import UUID

import sigaa_client
from fastapi import Depends
from sqlalchemy import ColumnElement, delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from api.db.enums import ClassroomRole, StudentSituation
from api.db.main import get_db
from api.db.models import (
    USER_WITHOUT_IDS,
    Classroom,
    ClassroomStatistic,
    ClassroomUser,
    Subject,
    User,
)

_WITH_CLASSROOM = selectinload(ClassroomUser.classroom).selectinload(Classroom.subject)


class ClassroomRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_by_user_id(self, user_id: UUID) -> list[ClassroomUser]:
        """Vínculos da lista de turmas do próprio usuário, com turma e componente."""
        return list(
            await self._session.scalars(
                select(ClassroomUser)
                .where(
                    ClassroomUser.user_id == user_id,
                    ClassroomUser.front_end_id.is_not(None),
                )
                .options(_WITH_CLASSROOM)
            )
        )

    async def get_by_front_end_id(
        self, user_id: UUID, front_end_id: str
    ) -> ClassroomUser | None:
        return await self._session.scalar(
            select(ClassroomUser)
            .where(
                ClassroomUser.user_id == user_id,
                ClassroomUser.front_end_id == front_end_id,
            )
            .options(_WITH_CLASSROOM)
        )

    async def save_user_classrooms(
        self,
        user: User,
        classrooms: Sequence[sigaa_client.Classroom],
        synced_at: datetime,
        *,
        refresh: bool = False,
    ) -> None:
        links = {
            link.classroom_id: link
            for link in await self._session.scalars(
                select(ClassroomUser).where(ClassroomUser.user_id == user.id)
            )
        }
        seen: set[UUID] = set()
        for item in classrooms:
            # Turma só do portal vem sem número: gravá-la duplicaria a do histórico.
            if not item.number:
                continue
            classroom = await self._save_classroom(item, refresh=refresh)
            link = links.get(classroom.id)
            if link is None:
                link = ClassroomUser(
                    user_id=user.id, classroom_id=classroom.id, role=ClassroomRole.ALUNO
                )
                self._session.add(link)
                links[classroom.id] = link
            link.front_end_id = item.id
            link.current = item.current
            seen.add(classroom.id)

        # Vínculos que só vieram da lista de participantes não são desta listagem.
        for classroom_id, link in links.items():
            if link.front_end_id is not None and classroom_id not in seen:
                await self._session.delete(link)
        user.classrooms_synced_at = synced_at
        await self._session.flush()

    async def list_members(self, classroom_id: UUID) -> list[ClassroomUser]:
        return [link for link in await self._links(classroom_id) if link.member]

    async def save_members(
        self,
        classroom_id: UUID,
        members: Sequence[sigaa_client.ClassroomMember],
        synced_at: datetime,
    ) -> None:
        links = {link.user_id: link for link in await self._links(classroom_id)}
        known = [link.user for link in links.values()]
        seen: set[UUID] = set()
        for member in members:
            user = await self._save_member(member, known)
            link = links.get(user.id)
            if link is None:
                link = ClassroomUser(user_id=user.id, classroom_id=classroom_id)
                self._session.add(link)
                links[user.id] = link
            link.role = ClassroomRole(member.role.value)
            link.member = True
            seen.add(user.id)

        for user_id, link in links.items():
            if user_id in seen:
                continue
            # O vínculo da lista de turmas do próprio usuário não é desta listagem.
            if link.front_end_id is None:
                await self._session.delete(link)
            else:
                link.member = False
        classroom = await self._session.get_one(Classroom, classroom_id)
        classroom.members_synced_at = synced_at
        await self._session.flush()

    async def list_statistics(self, classroom_id: UUID) -> list[ClassroomStatistic]:
        return list(
            await self._session.scalars(
                select(ClassroomStatistic).where(
                    ClassroomStatistic.classroom_id == classroom_id
                )
            )
        )

    async def save_statistics(
        self,
        classroom_id: UUID,
        shares: Sequence[sigaa_client.StatisticsShare],
        synced_at: datetime,
    ) -> None:
        await self._session.execute(
            delete(ClassroomStatistic).where(
                ClassroomStatistic.classroom_id == classroom_id
            )
        )
        self._session.add_all(
            ClassroomStatistic(
                classroom_id=classroom_id,
                situation=StudentSituation(share.situation.value),
                percentage=share.percentage,
            )
            for share in shares
        )
        classroom = await self._session.get_one(Classroom, classroom_id)
        classroom.statistics_synced_at = synced_at
        await self._session.flush()

    async def _links(self, classroom_id: UUID) -> list[ClassroomUser]:
        return list(
            await self._session.scalars(
                select(ClassroomUser)
                .where(ClassroomUser.classroom_id == classroom_id)
                .options(selectinload(ClassroomUser.user))
            )
        )

    async def _save_subject(self, item: sigaa_client.Subject) -> Subject:
        subject = await self._session.scalar(select(Subject).where(_same_subject(item)))
        if subject is None:
            subject = Subject(code=item.code)
            self._session.add(subject)

        subject.name = item.name
        subject.sigaa_id = item.sigaa_id or subject.sigaa_id
        subject.hours = item.hours or subject.hours
        subject.unity = item.unity or subject.unity
        await self._session.flush()

        return subject

    async def _save_classroom(
        self, item: sigaa_client.Classroom, *, refresh: bool
    ) -> Classroom:
        classroom = await self._session.scalar(
            select(Classroom)
            .join(Classroom.subject)
            .where(
                _same_subject(item.subject),
                Classroom.number == item.number,
                Classroom.semester == item.semester,
            )
        )
        # Turma de semestre passado quase não muda: só é regravada num refresh.
        if classroom is not None and not item.current and not refresh:
            return classroom

        subject = await self._save_subject(item.subject)
        if classroom is None:
            classroom = Classroom(
                subject_id=subject.id, number=item.number, semester=item.semester
            )
            self._session.add(classroom)

        # A turma é compartilhada: quem vê só o histórico não apaga a sala que o
        # portal de outro aluno trouxe.
        classroom.sigaa_id = item.sigaa_id or classroom.sigaa_id
        classroom.schedule = item.schedule or classroom.schedule
        classroom.room = item.room or classroom.room
        await self._session.flush()

        return classroom

    async def _save_member(
        self, member: sigaa_client.ClassroomMember, known: Sequence[User]
    ) -> User:
        user = None
        if member.registration is not None:
            user = await self._session.scalar(
                select(User).where(User.registration == member.registration)
            )
        person_owner = None
        if member.person_id is not None and (user is None or user.person_id is None):
            person_owner = await self._session.scalar(
                select(User).where(User.person_id == member.person_id)
            )
            user = user or person_owner
        # Quem foi visto antes só pelo email ganha os ids quando eles aparecem.
        if user is None and member.email is not None:
            user = await self._session.scalar(
                select(User).where(User.email == member.email, USER_WITHOUT_IDS)
            )
        if user is None and member.email is None and _without_ids(member):
            # Sem id nem email, só dá para reconhecer quem já estava nesta turma.
            user = next((u for u in known if _anonymous(u, member.name)), None)
        if user is None:
            user = User(name=member.name)
            self._session.add(user)

        # O perfil de quem já logou é mais confiável: só completa o que falta.
        shadow = user.profile_synced_at is None
        if shadow:
            user.name = member.name
        for field in ("photo", "email", "course", "unity"):
            value = getattr(member, field)
            if value is not None and (shadow or getattr(user, field) is None):
                setattr(user, field, value)
        user.registration = user.registration or member.registration
        # O `idPessoa` pode já ser de outro usuário, achado antes só por ele.
        if person_owner is None or person_owner is user:
            user.person_id = user.person_id or member.person_id
        await self._session.flush()

        return user


def _same_subject(item: sigaa_client.Subject) -> ColumnElement[bool]:
    if item.code:
        return Subject.code == item.code

    return Subject.code.is_(None) & (Subject.name == item.name)


def _without_ids(member: sigaa_client.ClassroomMember) -> bool:
    return member.registration is None and member.person_id is None


def _anonymous(user: User, name: str) -> bool:
    return (
        user.name == name
        and user.registration is None
        and user.person_id is None
        and user.email is None
    )


def get_classroom_repository(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> ClassroomRepository:
    return ClassroomRepository(session)


ClassroomRepositoryDep = Annotated[
    ClassroomRepository, Depends(get_classroom_repository)
]
