import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime
from typing import NamedTuple

import httpx
from fastapi import HTTPException, status
from pydantic import BaseModel, ConfigDict, field_serializer
from sigaa_client import (
    AuthenticationFailed,
    ClassroomNotFound,
    Credentials,
    NewsNotFound,
    SessionExpired,
    SigaaClient,
    SigaaError,
)
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from api.cache import NO_DIRECTIVES, CacheControl, Freshness
from api.db.main import Database
from api.db.models import OwnLink
from api.sigaa import SigaaConnection

log = logging.getLogger(__name__)

# Falhas da origem: o `stale-if-error` as cobre e um job as tenta de novo.
ORIGIN_ERRORS = (SigaaError, httpx.HTTPError)
# Sumiu do SIGAA: nem o cache vencido nem uma nova tentativa o trazem de volta.
GONE_ERRORS = (ClassroomNotFound, NewsNotFound)
# Falhas que nem o cache vencido nem uma nova tentativa resolvem.
_CLIENT_ERRORS = (AuthenticationFailed, SessionExpired, *GONE_ERRORS)


class Cached[T](NamedTuple):
    """O que um `load` leu do cache."""

    value: T
    synced_at: datetime
    freshness: Freshness


@dataclass(frozen=True)
class Item:
    """Um item de uma turma do usuário (ex.: uma notícia)."""

    link: OwnLink
    id: int


# O que uma tarefa sincroniza: a conta (None), uma turma ou um item dela.
type Target = OwnLink | Item | None


@dataclass(frozen=True)
class Context[T: Target]:
    """O que uma tarefa recebe: o client do SIGAA, o motor e o alvo."""

    client: SigaaClient
    sync: Sync
    target: T
    # O cliente pediu para revalidar: regrava até o que quase não muda.
    refresh: bool = False


# Uma tarefa busca no SIGAA e grava no cache; o nome da função a identifica no job.
type Task[T: Target] = Callable[[Context[T]], Awaitable[None]]


class Step(BaseModel):
    model_config = ConfigDict(frozen=True)

    task: str
    item_id: int | None = None

    @classmethod
    def of(cls, task: Task, item_id: int | None = None) -> Step:
        return cls(task=task.__name__, item_id=item_id)

    def target(self, link: OwnLink | None) -> Target:
        """O alvo do passo num job, com o vínculo da turma do job."""
        if link is None or self.item_id is None:
            return link
        return Item(link, self.item_id)


class Job(BaseModel):
    """Tarefas de uma turma (ou da conta, sem turma) numa sessão própria do SIGAA."""

    model_config = ConfigDict(frozen=True)

    credentials: Credentials
    classroom_id: str | None = None
    steps: tuple[Step, ...]
    attempt: int = 1

    @property
    def registration(self) -> str:
        return self.credentials.registration

    @property
    def key(self) -> str:
        """As mesmas tarefas da mesma turma do mesmo usuário têm a mesma chave."""
        steps = ",".join(
            step.task if step.item_id is None else f"{step.task}={step.item_id}"
            for step in self.steps
        )
        parts = (self.registration, self.classroom_id, steps, f"#{self.attempt}")
        return ":".join(part for part in parts if part is not None)

    @field_serializer("credentials")
    def _reveal(self, credentials: Credentials) -> dict[str, str]:
        # O job sai daqui cifrado: a senha só volta a ser legível na própria API.
        return {
            "registration": credentials.registration,
            "password": credentials.password.get_secret_value(),
        }


class Sync:
    """Resolve o cache com a sessão da conexão e junta o que vencer em jobs.

    Quem cria o motor publica `jobs()` no fim: cada job loga numa sessão própria.
    """

    def __init__(
        self,
        db: Database,
        sigaa: SigaaConnection,
        cache: CacheControl = NO_DIRECTIVES,
    ) -> None:
        self.db = db
        self._sigaa = sigaa
        self._cache = cache
        self._pending: dict[str | None, dict[Step, None]] = {}

    @property
    def registration(self) -> str:
        return self._sigaa.registration

    async def resolve[T: Target, V](
        self,
        task: Task[T],
        target: T,
        load: Callable[[AsyncSession], Awaitable[Cached[V] | None]],
    ) -> V:
        """Devolve o cache na hora e, se vencido, agenda a revalidação.

        `load` lê o cache numa sessão fechada antes de ir ao SIGAA. Sem cache, ou
        quando a requisição pede, roda a tarefa antes de responder e relê o cache;
        se o SIGAA falhar, o cache fica intacto.
        """
        cache = self._cache
        cached = await self.db.read(load)
        if cached is not None and (
            cached.freshness is Freshness.FROZEN
            or cache.only_if_cached
            or not cache.revalidate(cached.synced_at)
        ):
            return self._serve(task, target, cached)

        try:
            await self.perform(task, target, refresh=cached is not None)
        except IntegrityError:
            # Outro sync ganhou todas as tentativas de gravar: o que ele gravou serve.
            log.warning("Gravação concorrente em %s", task.__name__, exc_info=True)
        except _CLIENT_ERRORS:
            raise
        except ORIGIN_ERRORS:
            if cached is None or not cache.accepts_stale(cached.synced_at):
                raise
            log.warning("SIGAA falhou, servindo %s vencido", task.__name__)
            return self._serve(task, target, cached)

        fresh = await self.db.read(load)
        if fresh is None:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Cache is being updated, try again",
            )
        cache.served(fresh.synced_at)
        return fresh.value

    async def perform[T: Target](
        self, task: Task[T], target: T, *, refresh: bool = False
    ) -> None:
        """Roda a tarefa agora, com a sessão desta conexão."""
        if self._cache.only_if_cached:
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="Not cached"
            )
        client = await self._sigaa.client()
        await task(Context(client, self, target, refresh))

    def schedule[T: Target](self, task: Task[T], target: T) -> None:
        """Junta a tarefa ao job da turma do alvo (ou ao da conta, sem turma)."""
        match target:
            case Item(link=link, id=item_id):
                classroom_id, step = link.front_end_id, Step.of(task, item_id)
            case OwnLink(front_end_id=front_end_id):
                classroom_id, step = front_end_id, Step.of(task)
            case None:
                classroom_id, step = None, Step.of(task)
        self._pending.setdefault(classroom_id, {})[step] = None

    def jobs(self) -> list[Job]:
        return [
            Job(
                credentials=self._sigaa.credentials,
                classroom_id=classroom_id,
                steps=tuple(steps),
            )
            for classroom_id, steps in self._pending.items()
        ]

    def _serve[T: Target, V](self, task: Task[T], target: T, cached: Cached[V]) -> V:
        if cached.freshness is Freshness.STALE:
            self.schedule(task, target)
        self._cache.served(cached.synced_at)
        return cached.value
