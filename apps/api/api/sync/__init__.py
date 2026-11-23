from collections.abc import AsyncGenerator
from typing import Annotated

from fastapi import Depends

from api.cache import CacheControl, CacheControlDep
from api.db.main import Database, DatabaseDep
from api.sigaa import OptionalSigaaConnectionDep, SigaaConnection, SigaaConnectionDep
from api.sync.engine import Cached, Context, Item, Sync
from api.sync.queue import JobQueueDep, QStashQueue

__all__ = ["Cached", "Context", "Item", "OptionalSyncDep", "Sync", "SyncDep"]


async def _sync_lifecycle(
    db: Database,
    sigaa: SigaaConnection,
    cache: CacheControl,
    queue: QStashQueue,
) -> AsyncGenerator[Sync]:
    sync = Sync(db, sigaa, cache)
    yield sync
    # Nada roda depois da resposta: os jobs saem antes dela.
    await queue.enqueue(*sync.jobs())


async def get_optional_sync(
    db: DatabaseDep,
    sigaa: OptionalSigaaConnectionDep,
    cache: CacheControlDep,
    queue: JobQueueDep,
) -> AsyncGenerator[Sync | None]:
    """O `Sync` de quem está logado; `None` para visitantes."""
    if sigaa is None:
        yield None
        return
    async for sync in _sync_lifecycle(db, sigaa, cache, queue):
        yield sync


OptionalSyncDep = Annotated[Sync | None, Depends(get_optional_sync, scope="function")]


async def get_sync(
    db: DatabaseDep,
    sigaa: SigaaConnectionDep,
    cache: CacheControlDep,
    queue: JobQueueDep,
) -> AsyncGenerator[Sync]:
    async for sync in _sync_lifecycle(db, sigaa, cache, queue):
        yield sync


SyncDep = Annotated[Sync, Depends(get_sync, scope="function")]
