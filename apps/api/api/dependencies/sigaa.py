from collections.abc import AsyncGenerator
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
    """Abre um único `SigaaClient` por conexão, e só quando alguém precisa do SIGAA.

    Com `response`, é a conexão da requisição: cada uso do client renova os
    cookies. Sem `credentials` (a de um job), não há relogin: vale enquanto a
    sessão do SIGAA viver. Quem cria a conexão fecha o client com `aclose()`.
    """

    def __init__(
        self,
        registration: str,
        session_token: str | None = None,
        *,
        credentials: Credentials | None = None,
        response: Response | None = None,
    ) -> None:
        self.registration = registration
        self._credentials = credentials
        self._session_token = session_token
        self._response = response
        self._client: SigaaClient | None = None

    async def token(self) -> str:
        """O access_token, logando no SIGAA antes se ainda não houver um válido."""
        if self._session_token is None:
            await self.client()
        assert self._session_token is not None
        return self._session_token

    async def client(self) -> SigaaClient:
        if self._client is None:
            self._client = SigaaClient(
                session_token=self._session_token,
                credentials=self._credentials,
                on_session_renewed=self._renew,
            )
        if self._session_token is None:
            self._renew(await self._client.authenticate())
        else:
            self._renew(self._session_token)
        return self._client

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    def _renew(self, token: str) -> None:
        self._session_token = token
        # Se a chamada ao SIGAA falhar, a `HTTPException` descarta estes cookies.
        if self._response is not None and self._credentials is not None:
            set_refresh_cookie(self._response, self._credentials)
            set_access_cookie(self._response, token)


async def get_sigaa_connection(
    request: Request, response: Response
) -> AsyncGenerator[SigaaConnection]:
    credentials = read_refresh_cookie(request)
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
        )

    connection = SigaaConnection(
        credentials.registration,
        read_access_cookie(request),
        credentials=credentials,
        response=response,
    )
    try:
        yield connection
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
    finally:
        await connection.aclose()


SigaaConnectionDep = Annotated[SigaaConnection, Depends(get_sigaa_connection)]


async def get_sigaa_client(connection: SigaaConnectionDep) -> SigaaClient:
    return await connection.client()


SigaaClientDep = Annotated[SigaaClient, Depends(get_sigaa_client)]
