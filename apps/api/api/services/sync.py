import logging
from collections.abc import Awaitable, Callable, Sequence
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from functools import partial
from typing import NamedTuple, Protocol
from uuid import UUID

import httpx
from fastapi import HTTPException, status
from pydantic import BaseModel, ConfigDict
from sigaa_client import (
    AuthenticationFailed,
    Classroom,
    ClassroomMember,
    ClassroomNotFound,
    SessionExpired,
    SigaaClient,
    SigaaError,
    StatisticsShare,
    UserProfile,
)
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from api.db.models import ClassroomUser, User
from api.dependencies.cache import NO_DIRECTIVES, CacheControl, age
from api.dependencies.sigaa import SigaaConnection
from api.repositories.classroom import ClassroomRepository
from api.repositories.user import UserRepository

log = logging.getLogger(__name__)

PROFILE_TTL = timedelta(hours=24)
CLASSROOMS_TTL = timedelta(hours=72)
MENU_TTL = timedelta(hours=24)
# Detalhes das turmas atuais; os de semestres passados não mudam.
CLASSROOM_DETAILS_TTL = timedelta(hours=24)

_WRITE_ATTEMPTS = 3
# Falhas da origem que o `stale-if-error` cobre; as de sessão e de acesso, não.
_ORIGIN_ERRORS = (SigaaError, httpx.HTTPError)
_CLIENT_ERRORS = (AuthenticationFailed, SessionExpired, ClassroomNotFound)


class Task(StrEnum):
    ACCOUNT = "account"
    PROFILE = "profile"
    CLASSROOMS = "classrooms"
    FREQUENCY = "frequency"
    MEMBERS = "members"
    STATISTICS = "statistics"


class Job(BaseModel):
    """Uma tarefa do sync com o que ela precisa para rodar em outra requisição."""

    model_config = ConfigDict(frozen=True)

    task: Task
    registration: str
    session_token: str
    # `front_end_id` da turma nas tarefas de telas acadêmicas.
    classroom_id: str | None = None

    @property
    def key(self) -> str:
        """A mesma tarefa do mesmo usuário tem a mesma chave, seja qual for a sessão."""
        return ":".join(filter(None, (self.registration, self.task, self.classroom_id)))


class JobQueue(Protocol):
    async def enqueue(self, *jobs: Job) -> None:
        """Agenda os jobs. Uma falha ao agendar não chega a quem chamou."""
        ...


class Cached[T](NamedTuple):
    """O que um `load` leu do cache; sem `value`, não há cache."""

    value: T | None
    synced_at: datetime | None = None
    ttl: timedelta | None = None


def is_stale(synced_at: datetime | None, ttl: timedelta | None) -> bool:
    """Sem `synced_at` nunca foi sincronizado; sem `ttl` não vence nunca."""
    if synced_at is None:
        return True
    if ttl is None:
        return False

    return age(synced_at) > ttl


def details_ttl(current: bool) -> timedelta | None:
    return CLASSROOM_DETAILS_TTL if current else None


class SyncEngine:
    def __init__(
        self,
        sessionmaker: async_sessionmaker[AsyncSession],
        sigaa: SigaaConnection,
        queue: JobQueue,
    ) -> None:
        self._sessionmaker = sessionmaker
        self._sigaa = sigaa
        self._queue = queue

    @property
    def registration(self) -> str:
        return self._sigaa.registration

    async def resolve[T](
        self,
        task: Task,
        load: Callable[[AsyncSession], Awaitable[Cached[T]]],
        *,
        link: ClassroomUser | None = None,
        cache: CacheControl = NO_DIRECTIVES,
    ) -> T:
        """Devolve o cache na hora e, se vencido, agenda a revalidação.

        `load` lê o cache numa sessão fechada antes de ir ao SIGAA. Sem cache ou
        quando o `cache` da requisição pede, roda a tarefa antes de responder e
        relê o cache; se o SIGAA falhar, o cache fica intacto. `link` é o
        vínculo com a turma, nas tarefas de participantes, estatísticas e frequência.
        """
        cached = await self.read(load)
        if cached.value is not None and cached.synced_at is not None:
            if cache.only_if_cached or not cache.revalidate(cached.synced_at):
                return await self._serve(task, link, cached, cache)
        elif cache.only_if_cached:
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="Not cached"
            )

        try:
            await self._perform(task, link, refresh=cached.value is not None)
        except IntegrityError:
            # Outro sync ganhou todas as tentativas de gravar: o que ele gravou serve.
            log.warning("Gravação concorrente em %s", task, exc_info=True)
        except _CLIENT_ERRORS:
            raise
        except _ORIGIN_ERRORS:
            if (
                cached.value is None
                or cached.synced_at is None
                or not cache.accepts_stale(cached.synced_at)
            ):
                raise
            log.warning("SIGAA falhou, servindo %s vencido", task, exc_info=True)
            return await self._serve(task, link, cached, cache)

        fresh = await self.read(load)
        if fresh.value is None or fresh.synced_at is None:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Cache is being updated, try again",
            )
        cache.served(fresh.synced_at)
        return fresh.value

    async def _serve[T](
        self,
        task: Task,
        link: ClassroomUser | None,
        cached: Cached[T],
        cache: CacheControl,
    ) -> T:
        assert cached.value is not None and cached.synced_at is not None
        # Sem access_token, o job precisaria de um login: quem revalida é o
        # `POST /auth/sigaa/refresh`, que o app chama ao abrir.
        if self._sigaa.authenticated and is_stale(cached.synced_at, cached.ttl):
            await self.schedule(task, link.front_end_id if link else None)
        cache.served(cached.synced_at)
        return cached.value

    async def schedule(self, task: Task, classroom_id: str | None = None) -> None:
        """Agenda a tarefa na fila, para rodar fora desta requisição."""
        await self._queue.enqueue(await self._job(task, classroom_id))

    async def run(self, job: Job) -> None:
        """Roda um job que voltou da fila, com a sessão do SIGAA que veio nele."""
        link = None
        if job.classroom_id is not None:
            link = await self.read(partial(self._link, job.classroom_id))
            # A turma pode ter saído da lista do usuário depois de agendada.
            if link is None:
                return
        try:
            await self._perform(job.task, link)
        except SessionExpired:
            # Sem a senha não há relogin: o job acaba aqui e o próximo acesso agenda outro.
            log.info("Sessão do SIGAA expirou antes do job %s", job.key)

    async def read[T](self, query: Callable[[AsyncSession], Awaitable[T]]) -> T:
        async with self._sessionmaker() as session:
            return await query(session)

    async def _perform(
        self,
        task: Task,
        link: ClassroomUser | None = None,
        *,
        refresh: bool = False,
    ) -> None:
        client = await self._sigaa.client()
        match task:
            case Task.ACCOUNT:
                await self._sync_account(client)
            case Task.PROFILE:
                await self._save_profile(await client.profile.get_profile())
            case Task.CLASSROOMS:
                classrooms = await client.classrooms.list_classrooms()
                await self._save_classrooms(classrooms, refresh=refresh)
            case Task.MEMBERS | Task.STATISTICS | Task.FREQUENCY:
                assert link is not None
                await self._sync_screen(client, task, link)

    async def _sync_account(self, client: SigaaClient) -> None:
        """O sync do login: perfil, turmas e as telas das turmas que venceram."""
        user = await self.read(self._user)
        if user is None or is_stale(user.profile_synced_at, PROFILE_TTL):
            await self._save_profile(await client.profile.get_profile())
        if user is None or is_stale(user.classrooms_synced_at, CLASSROOMS_TTL):
            await self._save_classrooms(await client.classrooms.list_classrooms())

        # Uma tela de turma por job: o sync inteiro não cabe numa requisição só.
        await self._queue.enqueue(
            *[
                await self._job(task, link.front_end_id)
                for link in await self.read(self._links)
                for task, synced_at in (
                    (Task.MEMBERS, link.classroom.members_synced_at),
                    (Task.STATISTICS, link.classroom.statistics_synced_at),
                )
                if is_stale(synced_at, details_ttl(link.current))
            ]
        )

    async def _sync_screen(
        self, client: SigaaClient, task: Task, link: ClassroomUser
    ) -> None:
        assert link.front_end_id is not None
        if task is Task.MEMBERS:
            members = await client.classrooms.list_classroom_members(link.front_end_id)
            await self._save_members(link.classroom_id, members)
        elif task is Task.FREQUENCY:
            frequency = await client.classrooms.get_classroom_frequency(
                link.front_end_id
            )
            await self._write(
                lambda session: ClassroomRepository(session).save_frequency(
                    link.id, frequency, _now()
                )
            )
        else:
            shares = await client.classrooms.get_classroom_statistics(link.front_end_id)
            await self._save_statistics(link.classroom_id, shares)

    async def _job(self, task: Task, classroom_id: str | None = None) -> Job:
        return Job(
            task=task,
            registration=self.registration,
            session_token=await self._sigaa.token(),
            classroom_id=classroom_id,
        )

    async def _save_profile(self, profile: UserProfile) -> None:
        await self._write(
            lambda session: UserRepository(session).save_profile(profile, _now())
        )

    async def _save_classrooms(
        self, classrooms: Sequence[Classroom], *, refresh: bool = False
    ) -> None:
        if await self.read(self._user) is None:
            # As turmas penduram no usuário: sem perfil no cache, ele vem antes.
            client = await self._sigaa.client()
            await self._save_profile(await client.profile.get_profile())

        async def write(session: AsyncSession) -> None:
            user = await self._user(session)
            assert user is not None
            await ClassroomRepository(session).save_user_classrooms(
                user, classrooms, _now(), refresh=refresh
            )

        await self._write(write)

    async def _save_members(
        self, classroom_id: UUID, members: Sequence[ClassroomMember]
    ) -> None:
        await self._write(
            lambda session: ClassroomRepository(session).save_members(
                classroom_id, members, _now()
            )
        )

    async def _save_statistics(
        self, classroom_id: UUID, shares: Sequence[StatisticsShare]
    ) -> None:
        await self._write(
            lambda session: ClassroomRepository(session).save_statistics(
                classroom_id, shares, _now()
            )
        )

    async def _user(self, session: AsyncSession) -> User | None:
        return await UserRepository(session).get_by_registration(self.registration)

    async def _links(self, session: AsyncSession) -> list[ClassroomUser]:
        user = await self._user(session)
        if user is None:
            return []
        return await ClassroomRepository(session).list_by_user_id(user.id)

    async def _link(
        self, front_end_id: str, session: AsyncSession
    ) -> ClassroomUser | None:
        user = await self._user(session)
        if user is None:
            return None
        return await ClassroomRepository(session).get_by_front_end_id(
            user.id, front_end_id
        )

    async def _write(self, write: Callable[[AsyncSession], Awaitable[object]]) -> None:
        # Outro sync pode criar as mesmas linhas ao mesmo tempo: na tentativa
        # seguinte elas já existem e viram update.
        for attempt in range(_WRITE_ATTEMPTS):
            async with self._sessionmaker() as session:
                try:
                    await write(session)
                    await session.commit()
                    return
                except IntegrityError:
                    if attempt == _WRITE_ATTEMPTS - 1:
                        raise


def _now() -> datetime:
    return datetime.now(UTC)
