from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Annotated

import httpx
from fastapi import Depends, HTTPException, Request, Response, status
from sigaa_client import AuthenticationFailed, SessionExpired, SigaaClient, SigaaError

from api.utils.session import (
    read_access_cookie,
    read_refresh_cookie,
    set_access_cookie,
    set_refresh_cookie,
)


async def get_sigaa_client(
    request: Request, response: Response
) -> AsyncGenerator[SigaaClient]:
    credentials = read_refresh_cookie(request)
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
        )

    session_token = read_access_cookie(request)

    def on_session_renewed(token: str) -> None:
        set_access_cookie(response, token)

    try:
        async with SigaaClient(
            session_token=session_token,
            credentials=credentials,
            on_session_renewed=on_session_renewed,
        ) as client:
            if session_token is None:
                set_access_cookie(response, await client.authenticate())
            set_refresh_cookie(response, credentials)
            yield client
    except AuthenticationFailed, SessionExpired:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired"
        )
    except SigaaError, httpx.HTTPError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail="SIGAA is unavailable"
        )


SigaaClientDep = Annotated[SigaaClient, Depends(get_sigaa_client)]


async def get_sigaa_client_or_401(
    request: Request, response: Response
) -> AsyncGenerator[SigaaClient]:
    try:
        async with asynccontextmanager(get_sigaa_client)(request, response) as client:
            yield client
    except HTTPException as error:
        # As issues #10 e #16 exigem 401 também para falhas do SIGAA.
        if error.status_code == status.HTTP_502_BAD_GATEWAY:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail=error.detail
            ) from error
        raise


SigaaClient401Dep = Annotated[SigaaClient, Depends(get_sigaa_client_or_401)]
