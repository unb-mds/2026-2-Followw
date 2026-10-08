import logging
from collections.abc import Awaitable, Callable

import httpx
from fastapi import Request
from fastapi.responses import JSONResponse
from sigaa_client import (
    AuthenticationFailed,
    ClassroomNotFound,
    NewsNotFound,
    SessionExpired,
    SigaaError,
    SigaaSearchError,
)
from unb_browser import UnbBrowserError

from api.cookies import clear_cookies

log = logging.getLogger(__name__)

Handler = Callable[[Request, Exception], Awaitable[JSONResponse]]


def _error(status_code: int, detail: str | None = None) -> Handler:
    """Responde com `detail` fixo, ou com a mensagem da própria exceção."""

    async def handle(_: Request, error: Exception) -> JSONResponse:
        if status_code >= 500:
            log.warning("Falha na origem: %s", error, exc_info=error)
        return JSONResponse({"detail": detail or str(error)}, status_code=status_code)

    return handle


async def _authentication_failed(_: Request, __: Exception) -> JSONResponse:
    # A senha não vale mais: a sessão guardada nos cookies também não.
    response = JSONResponse({"detail": "Invalid credentials"}, status_code=401)
    clear_cookies(response)
    return response


# O Starlette escolhe o handler pela classe mais específica da exceção.
EXCEPTION_HANDLERS: dict[type[Exception], Handler] = {
    AuthenticationFailed: _authentication_failed,
    SessionExpired: _error(401, "Session expired"),
    ClassroomNotFound: _error(404, "Classroom not found"),
    NewsNotFound: _error(404, "News not found"),
    SigaaSearchError: _error(422),
    SigaaError: _error(502, "SIGAA is unavailable"),
    httpx.HTTPError: _error(502, "SIGAA is unavailable"),
    UnbBrowserError: _error(502, "UnB website is unavailable"),
}

# Respostas documentadas pelas rotas autenticadas no SIGAA.
SIGAA_ERRORS = {
    401: {"description": "Credenciais ausentes ou inválidas."},
    502: {"description": "SIGAA indisponível."},
}
