from collections.abc import AsyncGenerator
from contextlib import suppress
from typing import Annotated
from uuid import uuid4

import httpx
from fastapi import Depends, HTTPException, Request, Response, status
from sigaa_client import Credentials, SigaaClient, SigaaError, SigaaPublicClient

from api.cookies import (
    read_access_cookie,
    read_refresh_cookie,
    set_access_cookie,
    set_refresh_cookie,
)
from api.db.main import DatabaseDep
from api.logger import operation
from api.modules.oauth.auth import authenticate_bearer
from api.modules.oauth.scopes import FULL_ACCESS, AccessPolicy


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
        session_id: str | None = None,
        access: AccessPolicy = FULL_ACCESS,
    ) -> None:
        self.credentials = credentials
        self.session_id = session_id or str(uuid4())
        self.access = access
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
                with operation("sigaa.connect", reused_session=self.authenticated):
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
                with suppress(SigaaError, httpx.HTTPError), operation("sigaa.logout"):
                    await client.logout()
        finally:
            await client.aclose()

    def _renew(self, token: str) -> None:
        self._session_token = token
        # Se a chamada ao SIGAA falhar, o handler do erro descarta estes cookies.
        if self._response is not None:
            set_refresh_cookie(self._response, self.credentials, self.session_id)
            set_access_cookie(self._response, token, self.registration)


def _cookie_connection(request: Request, response: Response) -> SigaaConnection | None:
    session = read_refresh_cookie(request)
    if session is None:
        return None
    return SigaaConnection(
        session.credentials,
        read_access_cookie(request, session.credentials.registration),
        response=response,
        session_id=session.session_id,
    )


async def get_optional_sigaa_connection(
    request: Request, response: Response
) -> AsyncGenerator[SigaaConnection | None]:
    """Sessão opcional das rotas públicas: usa apenas cookies e ignora OAuth."""
    if "authorization" in request.headers:
        yield None
        return
    connection = _cookie_connection(request, response)
    if connection is None:
        yield None
        return
    try:
        yield connection
    finally:
        await connection.aclose()


OptionalSigaaConnectionDep = Annotated[
    SigaaConnection | None, Depends(get_optional_sigaa_connection)
]


async def get_sigaa_connection(
    request: Request, response: Response, db: DatabaseDep
) -> AsyncGenerator[SigaaConnection]:
    if "authorization" in request.headers:
        access = await authenticate_bearer(request, db)
        connection = SigaaConnection(
            access.credentials,
            access.session_token,
            access=AccessPolicy(access.scopes),
        )
    else:
        connection = _cookie_connection(request, response)
        if connection is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
            )
    try:
        yield connection
    finally:
        await connection.aclose()


SigaaConnectionDep = Annotated[SigaaConnection, Depends(get_sigaa_connection)]


async def get_sigaa_client(connection: SigaaConnectionDep) -> SigaaClient:
    return await connection.client()


SigaaClientDep = Annotated[SigaaClient, Depends(get_sigaa_client)]


async def get_sigaa_public_client() -> AsyncGenerator[SigaaPublicClient]:
    async with SigaaPublicClient() as client:
        yield client


SigaaPublicClientDep = Annotated[SigaaPublicClient, Depends(get_sigaa_public_client)]
