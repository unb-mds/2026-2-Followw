import httpx
from fastapi import APIRouter, Request, Response, status
from pydantic import BaseModel, Field
from sigaa_client import Credentials, SigaaClient, SigaaError

from api.cookies import clear_cookies, read_access_cookie
from api.db.main import DatabaseDep
from api.errors import SIGAA_ERRORS
from api.modules.auth.account import start_account
from api.sigaa import SigaaConnection, SigaaConnectionDep
from api.sync.queue import JobQueueDep

router = APIRouter()


class SigaaLoginRequest(BaseModel):
    registration: str = Field(min_length=9, max_length=9)
    password: str = Field(min_length=6, max_length=64)


@router.post("/sigaa")
async def sigaa_login(
    body: SigaaLoginRequest,
    response: Response,
    db: DatabaseDep,
    queue: JobQueueDep,
):
    credentials = Credentials(registration=body.registration, password=body.password)
    connection = SigaaConnection(credentials, response=response)
    try:
        await start_account(connection, db, queue)
    finally:
        await connection.aclose()

    return {"message": "Login successful"}


@router.post(
    "/sigaa/refresh", status_code=status.HTTP_204_NO_CONTENT, responses=SIGAA_ERRORS
)
async def sigaa_refresh(
    connection: SigaaConnectionDep, db: DatabaseDep, queue: JobQueueDep
) -> None:
    """Confere a senha se não houver access_token e agenda o sync do que venceu.

    O cache sai só com o refresh_token, então o app chama esta rota ao abrir.
    """
    await start_account(connection, db, queue)


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
