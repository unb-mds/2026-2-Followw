from typing import Self

import httpx

from .config import DEFAULT_TIMEOUT, SIGAA_BASE_URL, USER_AGENT
from .models import Credentials
from .private.classrooms import Classrooms
from .private.profile import Profile
from .private.session import OnSessionRenewed, Session
from .public.classrooms import PublicClassrooms
from .public.session import PublicSession


class _BaseClient:
    def __init__(
        self,
        timeout: float = DEFAULT_TIMEOUT,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._http = httpx.AsyncClient(
            base_url=SIGAA_BASE_URL,
            headers={"User-Agent": USER_AGENT},
            follow_redirects=True,
            timeout=timeout,
            transport=transport,
        )

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        await self._http.aclose()


class SigaaClient(_BaseClient):
    def __init__(
        self,
        credentials: Credentials | None = None,
        session_token: str | None = None,
        on_session_renewed: OnSessionRenewed | None = None,
        timeout: float = DEFAULT_TIMEOUT,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        if credentials is None and session_token is None:
            raise ValueError("Informe `credentials` e/ou `session_token`.")

        super().__init__(timeout=timeout, transport=transport)
        self._session = Session(
            self._http,
            credentials=credentials,
            session_token=session_token,
            on_session_renewed=on_session_renewed,
        )
        self.profile = Profile(self._session)
        self.classrooms = Classrooms(self._session)

    @property
    def session_token(self) -> str | None:
        return self._session.token

    async def authenticate(self) -> str:
        return await self._session.authenticate()

    async def logout(self) -> None:
        await self._session.logout()


class SigaaPublicClient(_BaseClient):
    """Client dos dados públicos do SIGAA (sem login)."""

    def __init__(
        self,
        timeout: float = DEFAULT_TIMEOUT,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        super().__init__(timeout=timeout, transport=transport)
        self._session = PublicSession(self._http)
        self.classrooms = PublicClassrooms(self._session)
