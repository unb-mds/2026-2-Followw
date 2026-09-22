import logging
from collections.abc import Awaitable, Callable, Sequence
from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import BackgroundTasks, Depends
from sigaa_client import (
    Classroom,
    ClassroomMember,
    SigaaClient,
    SigaaParseError,
    StatisticsShare,
    UserProfile,
)
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from api.db.main import get_sessionmaker
from api.db.models import ClassroomUser, User
from api.dependencies.sigaa import SigaaConnection, SigaaConnectionDep
from api.repositories.classroom import ClassroomRepository
from api.repositories.user import UserRepository

log = logging.getLogger(__name__)

PROFILE_TTL = timedelta(hours=24)
CLASSROOMS_TTL = timedelta(hours=72)
# Participantes e estatísticas das turmas atuais; as de semestres passados não mudam.
CLASSROOM_DETAILS_TTL = timedelta(hours=24)

_WRITE_ATTEMPTS = 3

# Jobs em andamento neste processo, para não repetir a mesma leitura do SIGAA.
_running: set[tuple[str, str]] = set()


def is_stale(synced_at: datetime | None, ttl: timedelta | None) -> bool:
    """Sem `synced_at` nunca foi sincronizado; sem `ttl` não vence nunca."""
    if synced_at is None:
        return True
    if ttl is None:
        return False
    # O SQLite (usado nos testes) devolve datetime sem fuso.
    if synced_at.tzinfo is None:
        synced_at = synced_at.replace(tzinfo=UTC)

    return datetime.now(UTC) - synced_at > ttl


def details_ttl(current: bool) -> timedelta | None:
    return CLASSROOM_DETAILS_TTL if current else None


class SyncEngine:
    """Cache dos dados do SIGAA no banco, no modelo stale-while-revalidate.

    Cada escrita abre a própria sessão do banco, então o mesmo código grava
    tanto antes de responder quanto em background, depois da resposta.
    """

    def __init__(
        self,
        sessionmaker: async_sessionmaker[AsyncSession],
        sigaa: SigaaConnection,
        tasks: BackgroundTasks,
    ) -> None:
        self._sessionmaker = sessionmaker
        self._sigaa = sigaa
        self._tasks = tasks

    @property
    def registration(self) -> str:
        return self._sigaa.registration

    async def resolve[T](
        self,
        key: str,
        *,
        cached: T | None,
        stale: bool,
        fetch: Callable[[SigaaClient], Awaitable[T]],
        save: Callable[[T], Awaitable[None]],
        refresh: bool = False,
    ) -> T:
        """Devolve o cache na hora e, se vencido, revalida em background.

        Sem cache, busca no SIGAA e grava em background. Com `refresh`, busca e
        grava antes de responder: se o SIGAA falhar, o cache fica intacto.
        """
        if cached is not None and not refresh:
            if stale:
                self._tasks.add_task(self._run, key, self._revalidate(fetch, save))
            return cached

        async with self._sigaa.open() as client:
            data = await fetch(client)
        if refresh:
            await save(data)
        else:
            self._tasks.add_task(self._run, f"save:{key}", lambda: save(data))
        return data

    def sync_account(self) -> None:
        """Agenda o sync do login: perfil, turmas, participantes e estatísticas vencidos."""
        self._tasks.add_task(self._run, "account", self._sync_account)

    async def save_profile(self, profile: UserProfile) -> None:
        await self._write(
            lambda session: UserRepository(session).save_profile(profile, _now())
        )

    async def save_classrooms(self, classrooms: Sequence[Classroom]) -> None:
        if await self._read(self._user) is None:
            # As turmas penduram no usuário: sem perfil no cache, ele vem antes.
            async with self._sigaa.detached().open() as client:
                await self.save_profile(await client.profile.get_profile())

        async def write(session: AsyncSession) -> None:
            user = await self._user(session)
            assert user is not None
            await ClassroomRepository(session).save_user_classrooms(
                user, classrooms, _now()
            )

        await self._write(write)

    async def save_members(
        self, classroom_id: UUID, members: Sequence[ClassroomMember]
    ) -> None:
        await self._write(
            lambda session: ClassroomRepository(session).save_members(
                classroom_id, members, _now()
            )
        )

    async def save_statistics(
        self, classroom_id: UUID, shares: Sequence[StatisticsShare]
    ) -> None:
        await self._write(
            lambda session: ClassroomRepository(session).save_statistics(
                classroom_id, shares, _now()
            )
        )

    async def _sync_account(self) -> None:
        async with self._sigaa.detached().open() as client:
            user = await self._read(self._user)
            if user is None or is_stale(user.profile_synced_at, PROFILE_TTL):
                await self.save_profile(await client.profile.get_profile())
            if user is None or is_stale(user.classrooms_synced_at, CLASSROOMS_TTL):
                await self.save_classrooms(
                    await client.classrooms.list_all_classrooms()
                )
            for link in await self._read(self._links):
                await self._sync_classroom(client, link)

    async def _sync_classroom(self, client: SigaaClient, link: ClassroomUser) -> None:
        assert link.front_end_id is not None
        classroom = link.classroom
        ttl = details_ttl(link.current)
        screens = (
            (
                classroom.members_synced_at,
                client.classrooms.list_classroom_members,
                self.save_members,
            ),
            (
                classroom.statistics_synced_at,
                client.classrooms.get_classroom_statistics,
                self.save_statistics,
            ),
        )
        for synced_at, fetch, save in screens:
            if not is_stale(synced_at, ttl):
                continue
            try:
                await save(classroom.id, await fetch(link.front_end_id))
            except SigaaParseError, IntegrityError:
                # Fica sem data de sync e é refeita da próxima vez; as outras seguem.
                log.warning("Turma %s não sincronizada", classroom.id, exc_info=True)

    def _revalidate[T](
        self,
        fetch: Callable[[SigaaClient], Awaitable[T]],
        save: Callable[[T], Awaitable[None]],
    ) -> Callable[[], Awaitable[None]]:
        async def job() -> None:
            async with self._sigaa.detached().open() as client:
                data = await fetch(client)
            await save(data)

        return job

    async def _run(self, key: str, job: Callable[[], Awaitable[None]]) -> None:
        marker = (self.registration, key)
        if marker in _running:
            return
        _running.add(marker)
        try:
            await job()
        except Exception:
            log.exception("Falha no sync em background (%s)", key)
        finally:
            _running.discard(marker)

    async def _user(self, session: AsyncSession) -> User | None:
        return await UserRepository(session).get_by_registration(self.registration)

    async def _links(self, session: AsyncSession) -> list[ClassroomUser]:
        user = await self._user(session)
        if user is None:
            return []
        return await ClassroomRepository(session).list_by_user_id(user.id)

    async def _read[T](self, query: Callable[[AsyncSession], Awaitable[T]]) -> T:
        async with self._sessionmaker() as session:
            return await query(session)

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


def get_sync_engine(
    sessionmaker: Annotated[
        async_sessionmaker[AsyncSession], Depends(get_sessionmaker)
    ],
    sigaa: SigaaConnectionDep,
    tasks: BackgroundTasks,
) -> SyncEngine:
    return SyncEngine(sessionmaker, sigaa, tasks)


SyncEngineDep = Annotated[SyncEngine, Depends(get_sync_engine)]
