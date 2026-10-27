import logging
from collections.abc import Awaitable, Callable

import httpx
from fastapi import Request
from fastapi.responses import JSONResponse
from sigaa_client import (
    AuthenticationFailed,
    ClassroomNotFound,
    DocumentUnavailable,
    MissingProfilePhoto,
    NewsNotFound,
    SigaaError,
    SigaaSearchError,
)
from unb_browser import UnbBrowserError

from api.cookies import clear_cookies
from api.db.units import UnitNotFound
from api.logger import error_fields, event

Handler = Callable[[Request, Exception], Awaitable[JSONResponse]]


def _error(status_code: int, detail: str | None = None) -> Handler:
    """Responde com `detail` fixo, ou com a mensagem da própria exceção."""

    async def handle(_: Request, error: Exception) -> JSONResponse:
        if status_code >= 500:
            event("origin.failed", level=logging.WARNING, **error_fields(error))
        return JSONResponse({"detail": detail or str(error)}, status_code=status_code)

    return handle


async def _authentication_failed(_: Request, __: Exception) -> JSONResponse:
    # A senha não vale mais: a sessão guardada nos cookies também não.
    response = JSONResponse({"detail": "Invalid credentials"}, status_code=401)
    clear_cookies(response)
    return response


async def _document_unavailable(_: Request, error: Exception) -> JSONResponse:
    detail = f"Não foi possível emitir o documento: {error}"
    return JSONResponse({"detail": detail}, status_code=422)


# O Starlette escolhe o handler pela classe mais específica da exceção. Sessão do
# SIGAA que morre mesmo após o relogin é falha da origem (502), não do login.
EXCEPTION_HANDLERS: dict[type[Exception], Handler] = {
    AuthenticationFailed: _authentication_failed,
    ClassroomNotFound: _error(404, "Classroom not found"),
    NewsNotFound: _error(404, "News not found"),
    SigaaSearchError: _error(422),
    UnitNotFound: _error(422),
    MissingProfilePhoto: _error(
        422,
        "Não foi possível emitir a carteirinha pois você não possui foto de perfil.",
    ),
    DocumentUnavailable: _document_unavailable,
    SigaaError: _error(502, "SIGAA is unavailable"),
    httpx.HTTPError: _error(502, "SIGAA is unavailable"),
    UnbBrowserError: _error(502, "UnB website is unavailable"),
}

# Respostas documentadas pelas rotas autenticadas no SIGAA.
SIGAA_ERRORS = {
    401: {"description": "Credenciais ausentes ou inválidas."},
    502: {"description": "SIGAA indisponível."},
}
