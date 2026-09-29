from fastapi import APIRouter, Response
from sigaa_client import RestaurantCredentials, RestaurantStatement, UserProfile

from api.dependencies.refresh import RefreshQuery
from api.dependencies.sigaa import SIGAA_ERRORS
from api.services.profile import ProfileServiceDep
from api.services.restaurant import RestaurantAccountServiceDep

router = APIRouter()


@router.get(
    "",
    response_model=UserProfile,
    summary="Consultar o perfil do usuário autenticado",
    responses=SIGAA_ERRORS,
)
async def get_me(
    service: ProfileServiceDep, refresh: RefreshQuery = False
) -> UserProfile:
    return await service.get_profile(refresh=refresh)


@router.get(
    "/ru-statement",
    response_model=RestaurantStatement,
    summary="Consultar extrato, saldo e grupo do RU",
    responses=SIGAA_ERRORS,
)
async def get_statement(
    service: RestaurantAccountServiceDep, response: Response
) -> RestaurantStatement:
    response.headers["Cache-Control"] = "no-store"
    return await service.get_statement()


@router.get(
    "/ru-token",
    response_model=RestaurantCredentials,
    summary="Consultar o token da carteirinha estudantil",
    description="Lê o QR code da carteirinha no SIGAA a cada acesso, sem persistência. Retorna token e valid_until; a validade informa mês/ano e o scraper representa o mês pelo dia 1.",
    responses=SIGAA_ERRORS,
)
async def get_token(
    service: RestaurantAccountServiceDep, response: Response
) -> RestaurantCredentials:
    response.headers["Cache-Control"] = "no-store"
    return await service.get_token()
