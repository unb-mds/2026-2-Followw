import asyncio
import hashlib
import hmac
import logging
import os
from ipaddress import ip_address
from math import ceil
from time import time

from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send
from upstash_ratelimit.asyncio import FixedWindow, Ratelimit, Response

from api.core.config import settings
from api.logger import event
from api.redis import redis_client


class RateLimitMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] == "OPTIONS":
            await self.app(scope, receive, send)
            return

        request = Request(scope)
        path = request.url.path.removeprefix(scope.get("root_path", "")).rstrip("/")
        # A assinatura e o controle de fluxo do QStash protegem a entrega dos jobs.
        if request.method == "POST" and path == "/jobs":
            await self.app(scope, receive, send)
            return

        if request.method == "DELETE" and path == "/auth/sigaa":
            await self.app(scope, receive, send)
            return

        login = request.method == "POST" and path == "/auth/sigaa"
        result = await _limit(request, login=login)
        if result is not None and not result.allowed:
            response = JSONResponse(
                status_code=429,
                content={"detail": "Too many requests"},
                headers={
                    "Retry-After": str(max(1, ceil(result.reset - time()))),
                    "Cache-Control": "no-store",
                },
            )
            await response(scope, receive, send)
            return

        await self.app(scope, receive, send)


async def _limit(request: Request, *, login: bool) -> Response | None:
    identifier = hashlib.sha256(_client_host(request).encode()).hexdigest()
    group = "login" if login else "api"
    limit = (
        settings.rate_limit_login_requests if login else settings.rate_limit_requests
    )

    try:
        async with asyncio.timeout(settings.redis_timeout_seconds):
            async with redis_client() as redis:
                if redis is None:
                    return None
                return await Ratelimit(
                    redis=redis,
                    limiter=FixedWindow(
                        max_requests=limit, window=settings.rate_limit_window_seconds
                    ),
                    prefix=f"followw:{settings.environment}:rate-limit:{group}",
                ).limit(identifier)
    except Exception as error:  # noqa: BLE001 — Redis é opcional, inclusive ao fechar.
        event(
            "rate_limit.unavailable",
            level=logging.WARNING,
            error_type=type(error).__name__,
        )
        return None


def _client_host(request: Request) -> str:
    host = request.client.host if request.client else "unknown"
    # Só a Vercel sobrescreve este cabeçalho; fora dela, confie no servidor ASGI.
    if os.environ.get("VERCEL") == "1":
        host = request.headers.get("x-vercel-forwarded-for", host).split(",")[0].strip()
    try:
        host = str(ip_address(host))
    except ValueError:
        pass
    forwarded = request.headers.get("x-followw-client", "")
    signature = request.headers.get("x-followw-client-signature", "")
    expected = hmac.digest(
        settings.jwt_secret_key.encode(),
        f"followw:rate-limit:{forwarded}".encode(),
        "sha256",
    ).hex()
    try:
        timestamp, _, address = forwarded.partition(":")
        if (
            hmac.compare_digest(signature.encode(), expected.encode())
            and abs(time() - int(timestamp)) <= 60
        ):
            host = str(ip_address(address))
    except ValueError, OverflowError:
        pass
    return host
