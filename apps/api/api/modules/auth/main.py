from typing import Annotated

import httpx
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Request,
    Response,
    status,
)
from pydantic import BaseModel
from sigaa_client import AuthenticationFailed, Credentials, SigaaClient, SigaaError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from api.db.main import get_sessionmaker
from api.dependencies.sigaa import SigaaConnection
from api.services.sync import SyncEngine
from api.utils.session import (
    clear_cookies,
    read_access_cookie,
    set_access_cookie,
    set_refresh_cookie,
)

router = APIRouter()


class SigaaLoginRequest(BaseModel):
    registration: str
    password: str


@router.post("/sigaa")
async def sigaa_login(
    body: SigaaLoginRequest,
    response: Response,
    tasks: BackgroundTasks,
    sessionmaker: Annotated[
        async_sessionmaker[AsyncSession], Depends(get_sessionmaker)
    ],
):
    credentials = Credentials(registration=body.registration, password=body.password)

    try:
        async with SigaaClient(credentials=credentials) as client:
            session_token = await client.authenticate()
    except AuthenticationFailed:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials"
        )
    except httpx.HTTPError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail="SIGAA is unavailable"
        )
    except SigaaError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(e),
        )

    set_access_cookie(response, session_token)
    set_refresh_cookie(response, credentials)
    connection = SigaaConnection(credentials, session_token)
    SyncEngine(sessionmaker, connection, tasks).sync_account()

    return {"message": "Login successful"}


@router.delete("/sigaa")
async def sigaa_logout(request: Request, response: Response):
    session_token = read_access_cookie(request)
    if session_token is not None:
        try:
            async with SigaaClient(session_token=session_token) as client:
                await client.logout()
        except SigaaError, httpx.HTTPError:
            pass

    clear_cookies(response)

    return {"message": "Logout successful"}
