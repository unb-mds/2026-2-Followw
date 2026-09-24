from typing import Self

import httpx

from .config import DEFAULT_TIMEOUT, USER_AGENT
from .restaurant import Restaurant


class UnbBrowser:
    """Client dos sites públicos da UnB — cada site é um resource."""

    def __init__(
        self,
        timeout: float = DEFAULT_TIMEOUT,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._http = httpx.AsyncClient(
            headers={"User-Agent": USER_AGENT},
            follow_redirects=True,
            timeout=timeout,
            transport=transport,
        )
        self.restaurant = Restaurant(self._http)

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        await self._http.aclose()
