import asyncio

from upstash_redis.asyncio import Redis

from api.core.config import settings

_client: tuple[asyncio.AbstractEventLoop, Redis] | None = None


def redis_client() -> Redis | None:
    global _client
    if not settings.upstash_redis_rest_url or not settings.upstash_redis_rest_token:
        return None

    # O pool de conexões é reaproveitado, mas não pode atravessar event loops.
    loop = asyncio.get_running_loop()
    if _client is None or _client[0] is not loop:
        _client = (
            loop,
            Redis(
                url=settings.upstash_redis_rest_url,
                token=settings.upstash_redis_rest_token,
                rest_retries=0,
                allow_telemetry=False,
            ),
        )
    return _client[1]
