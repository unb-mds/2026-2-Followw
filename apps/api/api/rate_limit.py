import asyncio
import hmac
import logging
import os
from ipaddress import ip_address, ip_network
from math import ceil
from time import time

from fastapi import HTTPException
from starlette._utils import get_route_path
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send
from upstash_ratelimit.asyncio import FixedWindow, Ratelimit, Response

from api.cookies import derive_key
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

        method = scope["method"]
        path = get_route_path(scope).rstrip("/")
        # A assinatura e o controle de fluxo do QStash protegem a entrega dos jobs.
        if method == "POST" and path == "/jobs":
            await self.app(scope, receive, send)
            return

        group, limit = _quota(method, path)
        result = await _limit(
            group,
            _bucket(_client_host(Request(scope))),
            limit,
            settings.rate_limit_window_seconds,
        )
        if result is not None and not result.allowed:
            # Sair sempre apaga os cookies; só a chamada ao SIGAA fica de fora.
            if method == "DELETE" and path == "/auth/sigaa":
                scope.setdefault("state", {})["rate_limited"] = True
            else:
                response = JSONResponse(
                    status_code=429,
                    content={"detail": "Too many requests"},
                    headers=_retry_headers(result),
                )
                await response(scope, receive, send)
                return

        await self.app(scope, receive, send)


def _quota(method: str, path: str) -> tuple[str, int]:
    return {
        ("POST", "/auth/sigaa"): ("login", settings.rate_limit_login_requests),
        ("POST", "/auth/sigaa/refresh"): (
            "refresh",
            settings.rate_limit_refresh_requests,
        ),
    }.get((method, path), ("api", settings.rate_limit_requests))


async def limit_registration(registration: str) -> None:
    """Cota de tentativas por matrícula, de qualquer IP, além da cota de login do IP."""
    result = await _limit(
        "registration",
        registration,
        settings.rate_limit_registration_requests,
        settings.rate_limit_registration_window_seconds,
    )
    if result is not None and not result.allowed:
        raise HTTPException(
            status_code=429,
            detail="Too many requests",
            headers=_retry_headers(result),
        )


def _retry_headers(result: Response) -> dict[str, str]:
    return {
        "Retry-After": str(max(1, ceil(result.reset - time()))),
        "Cache-Control": "no-store",
    }


async def _limit(group: str, key: str, limit: int, window: int) -> Response | None:
    redis = redis_client()
    if redis is None:
        return None

    identifier = hmac.digest(
        derive_key("followw:rate-limit"), key.encode(), "sha256"
    ).hex()
    try:
        async with asyncio.timeout(settings.redis_timeout_seconds):
            return await Ratelimit(
                redis=redis,
                limiter=FixedWindow(max_requests=limit, window=window),
                prefix=f"followw:{settings.environment}:rate-limit:{group}",
            ).limit(identifier)
    except Exception as error:  # noqa: BLE001 — Redis é opcional.
        event(
            "rate_limit.unavailable",
            level=logging.WARNING,
            error_type=type(error).__name__,
        )
        return None


def _bucket(host: str) -> str:
    try:
        address = ip_address(host)
    except ValueError:
        return host
    # Um cliente IPv6 controla o /64 inteiro.
    if address.version == 6:
        return str(address.ipv4_mapped or ip_network(f"{address}/64", strict=False))
    return str(address)


def _client_host(request: Request) -> str:
    host = request.client.host if request.client else "unknown"
    # Só a Vercel sobrescreve este cabeçalho; fora dela, confie no servidor ASGI.
    if os.environ.get("VERCEL") == "1":
        host = request.headers.get("x-vercel-forwarded-for", host).split(",")[0].strip()

    secret = settings.rate_limit_secret_key
    forwarded = request.headers.get("x-followw-client")
    signature = request.headers.get("x-followw-client-signature")
    if not secret or not forwarded or not signature:
        return host

    expected = hmac.digest(
        secret.encode(), f"followw:rate-limit:{forwarded}".encode(), "sha256"
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
