from collections.abc import Sequence
from datetime import datetime
from uuid import UUID, uuid4

import sigaa_client
from sqlalchemy import ColumnElement, Select, String, cast, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from api import academic_calendar
from api.db.enums import ClassroomRole, ClassroomStatus
from api.db.models import (
    USER_WITHOUT_IDS,
    Classroom,
    ClassroomFrequencyCache,
    ClassroomNews,
    ClassroomStatistic,
    ClassroomUser,
    OwnLink,
    Subject,
    User,
)

_WITH_CLASSROOM = selectinload(ClassroomUser.classroom).selectinload(Classroom.subject)
# Só quem ainda está na turma ganha o motivo de uma saída.
_ENROLLED = (None, ClassroomStatus.CURSANDO)


class ClassroomRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_by_user_id(self, user_id: UUID) -> list[OwnLink]:
        """Vínculos da lista de turmas do próprio usuário, com turma e componente."""
        rows = await self._session.scalars(
            select(ClassroomUser)
            .where(
                ClassroomUser.user_id == user_id,
                ClassroomUser.front_end_id.is_not(None),
            )
            .options(_WITH_CLASSROOM)
        )
        return [OwnLink.of(row) for row in rows]

    async def get(self, classroom_id: UUID) -> Classroom | None:
        return await self._session.get(Classroom, classroom_id)

    async def get_by_front_end_id(
        self, user_id: UUID, front_end_id: str
    ) -> OwnLink | None:
        return await self._own(
            select(ClassroomUser).where(
                ClassroomUser.user_id == user_id,
                ClassroomUser.front_end_id == front_end_id,
            )
        )

    async def get_by_sigaa_id(self, user_id: UUID, sigaa_id: str) -> OwnLink | None:
        return await self._own(
            select(ClassroomUser)
            .join(Classroom)
            .where(
                ClassroomUser.user_id == user_id,
                ClassroomUser.front_end_id.is_not(None),
                cast(Classroom.sigaa_id, String) == sigaa_id,
            )
        )

    async def get_frequency(
        self, user_classroom_id: UUID
    ) -> ClassroomFrequencyCache | None:
        return await self._session.scalar(
            select(ClassroomFrequencyCache).where(
                ClassroomFrequencyCache.user_classroom_id == user_classroom_id
            )
        )

    async def save_frequency(
        self,
        user_classroom_id: UUID,
        frequency: sigaa_client.ClassroomFrequency,
        synced_at: datetime,
    ) -> None:
        cached = await self.get_frequency(user_classroom_id)
        if cached is None:
            cached = ClassroomFrequencyCache(user_classroom_id=user_classroom_id)
            self._session.add(cached)
        cached.data = frequency.model_dump(mode="json")
        cached.synced_at = synced_at
        await self._session.flush()

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
                select(ClassroomUser)
                .where(ClassroomUser.user_id == user.id)
                .options(selectinload(ClassroomUser.classroom))
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
            if link.role == ClassroomRole.ALUNO:
                link.status = academic_calendar.member_status(classroom.semester)
            seen.add(classroom.id)

        # Vínculos que só vieram da lista de participantes não são desta listagem.
        for classroom_id, link in links.items():
            if link.front_end_id is None or classroom_id in seen:
                continue
            # Como na lista de participantes: a turma some da lista, mas o vínculo
            # fica com o motivo da saída.
            link.front_end_id = None
            link.current = False
            if link.role == ClassroomRole.ALUNO and link.status in _ENROLLED:
                link.status = academic_calendar.departure_status(
                    link.classroom.semester
                )
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
        classroom = await self._session.get_one(Classroom, classroom_id)
        links = {link.user_id: link for link in await self._links(classroom_id)}
        known = [link.user for link in links.values()]
        # Turma grande tem milhares de participantes: os usuários vêm de uma vez.
        users = await self._member_users(members)
        present = academic_calendar.member_status(classroom.semester)
        seen: set[UUID] = set()
        for member in members:
            user = self._save_member(member, users, known)
            link = links.get(user.id)
            if link is None:
                link = ClassroomUser(user_id=user.id, classroom_id=classroom_id)
                self._session.add(link)
                links[user.id] = link
            link.role = ClassroomRole(member.role.value)
            link.status = present if link.role == ClassroomRole.ALUNO else None
            link.member = True
            seen.add(user.id)

        departed = academic_calendar.departure_status(classroom.semester)
        for user_id, link in links.items():
            if user_id in seen:
                continue
            link.member = False
            if link.role == ClassroomRole.ALUNO:
                # Aluno que sumiu fica com o motivo; quem já saiu mantém o seu.
                if link.status in _ENROLLED:
                    link.status = departed
            # O vínculo da lista de turmas do próprio usuário não é desta listagem.
            elif link.front_end_id is None:
                await self._session.delete(link)
        classroom.members_synced_at = synced_at
        await self._session.flush()

    async def get_statistics(self, classroom_id: UUID) -> ClassroomStatistic | None:
        return await self._session.scalar(
            select(ClassroomStatistic).where(
                ClassroomStatistic.classroom_id == classroom_id
            )
        )

    async def save_statistics(
        self,
        classroom_id: UUID,
        shares: Sequence[sigaa_client.StatisticsShare],
        synced_at: datetime,
    ) -> None:
        cached = await self.get_statistics(classroom_id)
        if cached is None:
            cached = ClassroomStatistic(classroom_id=classroom_id)
            self._session.add(cached)
        cached.data = [share.model_dump(mode="json") for share in shares]
        classroom = await self._session.get_one(Classroom, classroom_id)
        classroom.statistics_synced_at = synced_at
        await self._session.flush()

    async def _own(self, query: Select[tuple[ClassroomUser]]) -> OwnLink | None:
        row = await self._session.scalar(query.options(_WITH_CLASSROOM))
        return OwnLink.of(row) if row is not None else None

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

    async def _member_users(
        self, members: Sequence[sigaa_client.ClassroomMember]
    ) -> _UserIndex:
        registrations = {m.registration for m in members if m.registration}
        person_ids = {m.person_id for m in members if m.person_id is not None}
        emails = {m.email for m in members if m.email}
        index = _UserIndex()
        for condition in (
            User.registration.in_(registrations),
            User.person_id.in_(person_ids),
            User.email.in_(emails) & USER_WITHOUT_IDS,
        ):
            for user in await self._session.scalars(select(User).where(condition)):
                index.add(user)
        return index

    def _save_member(
        self,
        member: sigaa_client.ClassroomMember,
        users: _UserIndex,
        known: Sequence[User],
    ) -> User:
        user = None
        if member.registration is not None:
            user = users.by_registration.get(member.registration)
        person_owner = None
        if member.person_id is not None and (user is None or user.person_id is None):
            person_owner = users.by_person_id.get(member.person_id)
            user = user or person_owner
        # Quem foi visto antes só pelo email ganha os ids quando eles aparecem.
        if user is None and member.email is not None:
            user = users.by_email.get(member.email)
        if user is None and member.email is None and _without_ids(member):
            # Sem id nem email, só dá para reconhecer quem já estava nesta turma.
            user = next((u for u in known if _anonymous(u, member.name)), None)
        if user is None:
            # O id é gerado aqui porque o vínculo precisa dele antes do flush.
            user = User(id=uuid4(), name=member.name)
            self._session.add(user)

        users.discard(user)
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
        users.add(user)

        return user


class NewsRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_by_classroom(self, classroom_id: UUID) -> list[ClassroomNews]:
        return list(
            await self._session.scalars(
                select(ClassroomNews)
                .where(ClassroomNews.classroom_id == classroom_id)
                .order_by(
                    ClassroomNews.published_on.desc(), ClassroomNews.sigaa_id.desc()
                )
            )
        )

    async def get(self, classroom_id: UUID, news_id: int) -> ClassroomNews | None:
        return await self._session.scalar(
            select(ClassroomNews).where(
                ClassroomNews.classroom_id == classroom_id,
                ClassroomNews.sigaa_id == news_id,
            )
        )

    async def save_list(
        self, classroom_id: UUID, news: Sequence[sigaa_client.News], synced_at: datetime
    ) -> None:
        existing = {
            item.sigaa_id: item for item in await self.list_by_classroom(classroom_id)
        }
        for item in news:
            assert item.id is not None
            cached = existing.get(item.id)
            if cached is None:
                cached = ClassroomNews(classroom_id=classroom_id, sigaa_id=item.id)
                self._session.add(cached)
                existing[item.id] = cached
            cached.title = item.title
            cached.published_on = item.published_on
        # A lista pode estar vazia; notícias antigas e seus conteúdos são preservados.
        classroom = await self._session.get_one(Classroom, classroom_id)
        classroom.news_synced_at = synced_at
        await self._session.flush()

    async def save_content(
        self, classroom_id: UUID, news: sigaa_client.News, synced_at: datetime
    ) -> None:
        assert news.id is not None
        cached = await self.get(classroom_id, news.id)
        if cached is None:
            cached = ClassroomNews(classroom_id=classroom_id, sigaa_id=news.id)
            self._session.add(cached)
        cached.title = news.title
        cached.published_on = news.published_on
        cached.published_at = news.published_at
        cached.content = news.content
        cached.attachments = [
            attachment.model_dump(mode="json") for attachment in news.attachments
        ]
        cached.content_synced_at = synced_at
        await self._session.flush()


class _UserIndex:
    """Usuários por identidade, espelhando as consultas que o banco responderia."""

    def __init__(self) -> None:
        self.by_registration: dict[str, User] = {}
        self.by_person_id: dict[int, User] = {}
        self.by_email: dict[str, User] = {}

    def _keys(self, user: User) -> list[tuple[dict, object]]:
        keys: list[tuple[dict, object]] = [
            (self.by_registration, user.registration),
            (self.by_person_id, user.person_id),
        ]
        if user.registration is None and user.person_id is None:
            keys.append((self.by_email, user.email))
        return [(index, key) for index, key in keys if key is not None]

    def add(self, user: User) -> None:
        for index, key in self._keys(user):
            index[key] = user

    def discard(self, user: User) -> None:
        for index, key in self._keys(user):
            if index.get(key) is user:
                del index[key]


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
