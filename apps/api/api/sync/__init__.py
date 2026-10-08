from collections.abc import AsyncGenerator
from typing import Annotated

from fastapi import Depends

from api.cache import CacheControlDep
from api.db.main import DatabaseDep
from api.sigaa import SigaaConnectionDep
from api.sync.engine import Cached, Context, Item, Sync
from api.sync.queue import JobQueueDep

__all__ = ["Cached", "Context", "Item", "Sync", "SyncDep"]


async def get_sync(
    db: DatabaseDep,
    sigaa: SigaaConnectionDep,
    cache: CacheControlDep,
    queue: JobQueueDep,
) -> AsyncGenerator[Sync]:
    sync = Sync(db, sigaa, cache)
    yield sync
    # Nada roda depois da resposta: os jobs saem antes dela.
    await queue.enqueue(*sync.jobs())


SyncDep = Annotated[Sync, Depends(get_sync, scope="function")]
