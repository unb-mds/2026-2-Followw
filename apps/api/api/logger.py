import json
import logging
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import UTC, datetime
from time import perf_counter
from uuid import uuid4

from starlette.types import ASGIApp, Message, Receive, Scope, Send

_context: ContextVar[dict | None] = ContextVar("log_context", default=None)
_log = logging.getLogger("followw")
_log.setLevel(logging.INFO)
# O runtime pode ter um handler raiz; a saída JSON já é emitida pelo nosso.
_log.propagate = False
if not _log.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(message)s"))
    _log.addHandler(_handler)

# Só metadados operacionais; nunca objetos, payloads, URLs ou textos de exceções.
_FIELDS = {
    "request_id",
    "method",
    "route",
    "status_code",
    "duration_ms",
    "error_type",
    "task",
    "attempt",
    "step_count",
    "job_count",
    "failed_count",
    "skipped_count",
    "reused_session",
}


def event(name: str, *, level: int = logging.INFO, **fields) -> None:
    context = {
        key: value
        for key, value in ((_context.get() or {}) | fields).items()
        if key in _FIELDS and type(value) in (str, int, float, bool, type(None))
    }
    _log.log(
        level,
        json.dumps(
            {
                "timestamp": datetime.now(UTC).isoformat(),
                "level": logging.getLevelName(level),
                "event": name,
                **context,
            }
        ),
    )


@contextmanager
def operation(name: str, **fields) -> Iterator[None]:
    token = _context.set((_context.get() or {}) | fields)
    started = perf_counter()
    event(f"{name}.started")
    try:
        yield
    except BaseException as error:
        event(
            f"{name}.failed",
            level=logging.WARNING,
            error_type=type(error).__name__,
            duration_ms=round((perf_counter() - started) * 1000, 2),
        )
        raise
    else:
        event(
            f"{name}.completed", duration_ms=round((perf_counter() - started) * 1000, 2)
        )
    finally:
        _context.reset(token)


class RequestLoggingMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        token = _context.set({"request_id": uuid4().hex, "method": scope["method"]})
        started = perf_counter()
        status_code = 500

        async def logged_send(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
            await send(message)

        event("request.started")
        try:
            await self.app(scope, receive, logged_send)
        except BaseException as error:
            event(
                "request.failed", level=logging.ERROR, error_type=type(error).__name__
            )
            raise
        finally:
            # Routers incluídos no FastAPI guardam o caminho completo neste contexto.
            matched = scope.get("fastapi", {}).get("effective_route_context")
            route = getattr(matched or scope.get("route"), "path_format", None)
            event(
                "request.completed",
                route=route,
                status_code=status_code,
                duration_ms=round((perf_counter() - started) * 1000, 2),
            )
            _context.reset(token)
