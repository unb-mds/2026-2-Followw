import asyncio

import httpx
from fastapi import APIRouter, Request, Response, status
from pydantic import BaseModel, Field
from sigaa_client import Credentials, SigaaClient, SigaaError

from api.cookies import clear_cookies, read_access_cookie, read_refresh_cookie
from api.db.main import DatabaseDep
from api.errors import SIGAA_ERRORS
from api.modules.auth.account import start_account
from api.rate_limit import limit_registration
from api.sigaa import SigaaConnection, SigaaConnectionDep
from api.sync.queue import JobQueueDep

router = APIRouter()
_SIGAA_LOGOUT_TIMEOUT = 1.0


class SigaaLoginRequest(BaseModel):
    registration: str = Field(pattern=r"^[0-9]{9}$")
    password: str = Field(min_length=6, max_length=64)


@router.post("/sigaa", summary="Entrar com a conta do SIGAA")
async def sigaa_login(
    body: SigaaLoginRequest,
    response: Response,
    db: DatabaseDep,
    queue: JobQueueDep,
):
    await limit_registration(body.registration)
    credentials = Credentials(registration=body.registration, password=body.password)
    connection = SigaaConnection(credentials, response=response)
    try:
        await start_account(connection, db, queue)
    finally:
        await connection.aclose()

    return {"message": "Login successful"}


@router.post(
    "/sigaa/refresh",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Renovar a sessão do SIGAA",
    responses=SIGAA_ERRORS,
)
async def sigaa_refresh(
    connection: SigaaConnectionDep, db: DatabaseDep, queue: JobQueueDep
) -> None:
    """Renova o acesso e solicita a atualização dos dados do usuário."""
    await start_account(connection, db, queue)


@router.delete("/sigaa", summary="Sair do SIGAA")
async def sigaa_logout(request: Request, response: Response):
    credentials = read_refresh_cookie(request)
    session_token = credentials and read_access_cookie(
        request, credentials.registration
    )
    if session_token is not None and not getattr(request.state, "rate_limited", False):
        try:
            async with (
                asyncio.timeout(_SIGAA_LOGOUT_TIMEOUT),
                SigaaClient(session_token=session_token) as client,
            ):
                await client.logout()
        except SigaaError, httpx.HTTPError, TimeoutError:
            pass

    clear_cookies(response)

    return {"message": "Logout successful"}
