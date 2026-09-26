import logging
from collections.abc import AsyncGenerator
from typing import Annotated

import httpx
from fastapi import Depends, HTTPException, status
from unb_browser import UnbBrowser, UnbBrowserError

log = logging.getLogger(__name__)


async def get_unb_browser() -> AsyncGenerator[UnbBrowser]:
    try:
        async with UnbBrowser() as browser:
            yield browser
    except UnbBrowserError, httpx.HTTPError:
        log.warning("Falha ao consultar site público da UnB", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail="UnB website is unavailable"
        )


UnbBrowserDep = Annotated[UnbBrowser, Depends(get_unb_browser)]
