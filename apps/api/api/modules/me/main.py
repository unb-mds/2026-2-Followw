from fastapi import APIRouter
from sigaa_client import UserProfile

from api.dependencies.sigaa import SigaaClient401Dep

router = APIRouter()


@router.get(
    "",
    response_model=UserProfile,
    summary="Consultar o perfil do usuário autenticado",
    responses={
        401: {"description": "Credenciais ausentes, inválidas ou erro do SIGAA."}
    },
)
async def get_me(client: SigaaClient401Dep) -> UserProfile:
    return await client.profile.get_profile()
