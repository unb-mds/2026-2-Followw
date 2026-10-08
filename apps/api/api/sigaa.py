from collections.abc import AsyncGenerator
from contextlib import suppress
from typing import Annotated

import httpx
from fastapi import Depends, HTTPException, Request, Response, status
from sigaa_client import Credentials, SigaaClient, SigaaError

from api.cookies import (
    read_access_cookie,
    read_refresh_cookie,
    set_access_cookie,
    set_refresh_cookie,
)


class SigaaConnection:
    """Abre um único `SigaaClient`, e só quando alguém precisa do SIGAA.

    Sem `session_token`, abrir o client já loga. Com `response`, é a conexão da
    requisição: abrir o client renova os cookies. Quem cria a conexão a fecha.
    """

    def __init__(
        self,
        credentials: Credentials,
        session_token: str | None = None,
        *,
        response: Response | None = None,
    ) -> None:
        self.credentials = credentials
        self._session_token = session_token
        self._response = response
        self._client: SigaaClient | None = None

    @property
    def registration(self) -> str:
        return self.credentials.registration

    @property
    def authenticated(self) -> bool:
        """Há um access_token, lido do cookie ou criado nesta conexão."""
        return self._session_token is not None

    async def client(self) -> SigaaClient:
        if self._client is None:
            client = SigaaClient(
                credentials=self.credentials,
                session_token=self._session_token,
                on_session_renewed=self._renew,
            )
            try:
                token = self._session_token or await client.authenticate()
            except BaseException:
                await client.aclose()
                raise
            self._client = client
            self._renew(token)
        return self._client

    async def aclose(self, *, logout: bool = False) -> None:
        """Fecha o client; com `logout`, encerra antes a sessão no SIGAA."""
        client, self._client = self._client, None
        if client is None:
            return
        try:
            if logout:
                with suppress(SigaaError, httpx.HTTPError):
                    await client.logout()
        finally:
            await client.aclose()

    def _renew(self, token: str) -> None:
        self._session_token = token
        # Se a chamada ao SIGAA falhar, o handler do erro descarta estes cookies.
        if self._response is not None:
            set_refresh_cookie(self._response, self.credentials)
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
        credentials, read_access_cookie(request), response=response
    )
    try:
        yield connection
    finally:
        await connection.aclose()


SigaaConnectionDep = Annotated[SigaaConnection, Depends(get_sigaa_connection)]


async def get_sigaa_client(connection: SigaaConnectionDep) -> SigaaClient:
    return await connection.client()


SigaaClientDep = Annotated[SigaaClient, Depends(get_sigaa_client)]
