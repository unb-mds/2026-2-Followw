import httpx
from fastapi import APIRouter, HTTPException, Request, Response, status
from pydantic import BaseModel
from sigaa_client import AuthenticationFailed, Credentials, SigaaClient, SigaaError

from src.utils.session import (
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
async def sigaa_login(body: SigaaLoginRequest, response: Response):
    credentials = Credentials(registration=body.registration, password=body.password)

    try:
        async with SigaaClient(credentials=credentials) as client:
            session_token = await client.authenticate()
    except AuthenticationFailed:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials"
        )
    except SigaaError, httpx.HTTPError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail="SIGAA is unavailable"
        )

    set_access_cookie(response, session_token)
    set_refresh_cookie(response, credentials)
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
