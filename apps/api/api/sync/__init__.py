from collections.abc import AsyncGenerator
from typing import Annotated

from fastapi import Depends

from api.cache import CacheControlDep
from api.db.main import DatabaseDep
from api.sigaa import OptionalSigaaConnectionDep, SigaaConnectionDep
from api.sync.engine import Cached, Context, Item, Sync
from api.sync.queue import JobQueueDep

__all__ = ["Cached", "Context", "Item", "OptionalSyncDep", "Sync", "SyncDep"]


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
    sync = Sync(db, sigaa, cache)
    yield sync
    # Nada roda depois da resposta: os jobs saem antes dela.
    await queue.enqueue(*sync.jobs())


OptionalSyncDep = Annotated[Sync | None, Depends(get_optional_sync, scope="function")]


async def get_sync(_authenticated: SigaaConnectionDep, sync: OptionalSyncDep) -> Sync:
    # `SigaaConnectionDep` já respondeu 401 aos visitantes.
    assert sync is not None
    return sync


SyncDep = Annotated[Sync, Depends(get_sync)]
