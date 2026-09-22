from collections.abc import AsyncGenerator, AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated

import httpx
from fastapi import Depends, HTTPException, Request, Response, status
from sigaa_client import (
    AuthenticationFailed,
    Credentials,
    SessionExpired,
    SigaaClient,
    SigaaError,
)

from api.utils.session import (
    clear_cookies_headers,
    read_access_cookie,
    read_refresh_cookie,
    set_access_cookie,
    set_refresh_cookie,
)


class SigaaConnection:
    """Abre um `SigaaClient` só quando alguém precisa do SIGAA.

    Com `response`, é a conexão da requisição: grava o token renovado no cookie.
    `detached()` devolve uma cópia sem cookies para o sync em background.
    """

    def __init__(
        self,
        credentials: Credentials,
        session_token: str | None = None,
        response: Response | None = None,
    ) -> None:
        self.credentials = credentials
        self._session_token = session_token
        self._response = response

    @property
    def registration(self) -> str:
        return self.credentials.registration

    def detached(self) -> SigaaConnection:
        return SigaaConnection(self.credentials, self._session_token)

    @asynccontextmanager
    async def open(self) -> AsyncIterator[SigaaClient]:
        def on_session_renewed(token: str) -> None:
            self._session_token = token
            if self._response is not None:
                set_access_cookie(self._response, token)

        async with SigaaClient(
            session_token=self._session_token,
            credentials=self.credentials,
            on_session_renewed=on_session_renewed,
        ) as client:
            if self._session_token is None:
                on_session_renewed(await client.authenticate())
            yield client


async def get_sigaa_connection(
    request: Request, response: Response
) -> AsyncGenerator[SigaaConnection]:
    credentials = read_refresh_cookie(request)
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
        )

    session_token = read_access_cookie(request)
    # O teardown do `yield` roda tarde demais para gravar cookies; como uma
    # `HTTPException` descarta estes, só as respostas de sucesso renovam a sessão.
    set_refresh_cookie(response, credentials)
    if session_token is not None:
        set_access_cookie(response, session_token)

    try:
        yield SigaaConnection(credentials, session_token, response)
    except AuthenticationFailed:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired",
            headers=clear_cookies_headers(),
        )
    # A credencial ainda pode valer: não desloga por uma falha de sessão.
    except SessionExpired:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired"
        )
    except SigaaError, httpx.HTTPError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail="SIGAA is unavailable"
        )


SigaaConnectionDep = Annotated[SigaaConnection, Depends(get_sigaa_connection)]


async def get_sigaa_client(
    connection: SigaaConnectionDep,
) -> AsyncGenerator[SigaaClient]:
    async with connection.open() as client:
        yield client


SigaaClientDep = Annotated[SigaaClient, Depends(get_sigaa_client)]
