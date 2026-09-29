from fastapi import APIRouter, Response
from sigaa_client import RestaurantCredentials, RestaurantStatement, UserProfile

from api.dependencies.refresh import RefreshQuery
from api.services.profile import ProfileServiceDep
from api.services.restaurant import RestaurantAccountServiceDep

router = APIRouter()
ERRORS = {
    401: {"description": "Credenciais ausentes ou inválidas."},
    502: {"description": "SIGAA indisponível."},
}


@router.get(
    "",
    response_model=UserProfile,
    summary="Consultar o perfil do usuário autenticado",
    responses=ERRORS,
)
async def get_me(
    service: ProfileServiceDep, refresh: RefreshQuery = False
) -> UserProfile:
    return await service.get_profile(refresh=refresh)


@router.get(
    "/ru-statement",
    response_model=RestaurantStatement,
    summary="Consultar extrato, saldo e grupo do estudante no RU",
    description="",
    responses=ERRORS,
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
    responses=ERRORS,
)
async def get_token(
    service: RestaurantAccountServiceDep, response: Response
) -> RestaurantCredentials:
    response.headers["Cache-Control"] = "no-store"
    return await service.get_token()
