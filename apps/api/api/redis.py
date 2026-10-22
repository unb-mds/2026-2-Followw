from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from upstash_redis.asyncio import Redis

from api.core.config import settings


@asynccontextmanager
async def redis_client() -> AsyncIterator[Redis | None]:
    if not settings.upstash_redis_rest_url or not settings.upstash_redis_rest_token:
        yield None
        return

    # Cada requisição usa seu event loop; o pool não pode sobreviver a ele.
    async with Redis(
        url=settings.upstash_redis_rest_url,
        token=settings.upstash_redis_rest_token,
        rest_retries=0,
        allow_telemetry=False,
    ) as client:
        yield client
