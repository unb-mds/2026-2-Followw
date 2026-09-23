from fastapi import APIRouter
from sigaa_client import UserProfile

from api.dependencies.refresh import RefreshQuery
from api.services.profile import ProfileServiceDep

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
async def get_me(
    service: ProfileServiceDep, refresh: RefreshQuery = False
) -> UserProfile:
    return await service.get_profile(refresh=refresh)
