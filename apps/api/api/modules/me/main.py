from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sigaa_client import SigaaClient, UserProfile

from api.dependencies.sigaa import get_sigaa_client

router = APIRouter()


async def get_me_sigaa_client(
    request: Request, response: Response
) -> AsyncGenerator[SigaaClient]:
    try:
        async with asynccontextmanager(get_sigaa_client)(request, response) as client:
            yield client
    except HTTPException as error:
        # A issue #10 exige 401 também para falhas do SIGAA nesta rota.
        if error.status_code == status.HTTP_502_BAD_GATEWAY:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail=error.detail
            ) from error
        raise


@router.get(
    "",
    response_model=UserProfile,
    summary="Consultar o perfil do usuário autenticado",
    responses={
        401: {"description": "Credenciais ausentes, inválidas ou erro do SIGAA."}
    },
)
async def get_me(
    client: Annotated[SigaaClient, Depends(get_me_sigaa_client)],
) -> UserProfile:
    return await client.profile.get_profile()
