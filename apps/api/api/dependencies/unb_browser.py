import logging
from collections.abc import AsyncGenerator
from contextlib import AsyncExitStack
from typing import Annotated

import httpx
from fastapi import Depends, HTTPException, status
from unb_browser import UnbBrowser, UnbBrowserError

log = logging.getLogger(__name__)


class UnbBrowserConnection:
    """Abre um único `UnbBrowser` por requisição, e só quando alguém precisa do site."""

    def __init__(self, stack: AsyncExitStack) -> None:
        self._stack = stack
        self._browser: UnbBrowser | None = None

    async def browser(self) -> UnbBrowser:
        if self._browser is None:
            self._browser = await self._stack.enter_async_context(UnbBrowser())
        return self._browser


async def get_unb_browser() -> AsyncGenerator[UnbBrowserConnection]:
    async with AsyncExitStack() as stack:
        try:
            yield UnbBrowserConnection(stack)
        except UnbBrowserError, httpx.HTTPError:
            log.warning("Falha ao consultar site público da UnB", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="UnB website is unavailable",
            )


UnbBrowserDep = Annotated[UnbBrowserConnection, Depends(get_unb_browser)]
