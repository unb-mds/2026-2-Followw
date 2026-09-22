from fastapi import APIRouter
from sigaa_client import UserProfile

from api.dependencies.sigaa import SigaaClientDep

router = APIRouter()


@router.get(
    "",
    response_model=UserProfile,
    summary="Consultar o perfil do usuário autenticado",
    responses={
        401: {"description": "Credenciais ausentes ou inválidas."},
        502: {"description": "SIGAA indisponível."},
    },
)
async def get_me(client: SigaaClientDep) -> UserProfile:
    return await client.profile.get_profile()
