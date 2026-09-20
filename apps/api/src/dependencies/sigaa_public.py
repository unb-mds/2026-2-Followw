from collections.abc import AsyncGenerator
from typing import Annotated

import httpx
from fastapi import Depends, HTTPException, status
from sigaa_client import SigaaError, SigaaPublicClient


async def get_sigaa_public_client() -> AsyncGenerator[SigaaPublicClient]:
    try:
        async with SigaaPublicClient() as client:
            yield client
    except SigaaError, httpx.HTTPError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail="SIGAA is unavailable"
        )


SigaaPublicClientDep = Annotated[SigaaPublicClient, Depends(get_sigaa_public_client)]
