from fastapi import APIRouter
from sigaa_client import RestaurantCredentials, RestaurantStatement, UserProfile

from api.dependencies.cache import CacheControlDep, NoStore
from api.dependencies.sigaa import SIGAA_ERRORS, SigaaConnectionDep
from api.modules.me.models import UserSettings, UserSettingsPatch
from api.services.profile import ProfileServiceDep
from api.services.restaurant import RestaurantAccountServiceDep
from api.services.settings import SettingsServiceDep

router = APIRouter()


@router.get(
    "",
    response_model=UserProfile,
    summary="Consultar o perfil do usuário autenticado",
    responses=SIGAA_ERRORS,
)
async def get_me(service: ProfileServiceDep, cache: CacheControlDep) -> UserProfile:
    return await service.get_profile(cache)


@router.get(
    "/ru-statement",
    response_model=RestaurantStatement,
    summary="Consultar extrato, saldo e grupo do RU",
    responses=SIGAA_ERRORS,
    dependencies=[NoStore],
)
async def get_statement(service: RestaurantAccountServiceDep) -> RestaurantStatement:
    return await service.get_statement()


@router.get(
    "/ru-token",
    response_model=RestaurantCredentials,
    summary="Consultar o token da carteirinha estudantil",
    description="Lê o QR code da carteirinha no SIGAA a cada acesso, sem persistência. Retorna token e valid_until; a validade informa mês/ano e o scraper representa o mês pelo dia 1.",
    responses=SIGAA_ERRORS,
    dependencies=[NoStore],
)
async def get_token(service: RestaurantAccountServiceDep) -> RestaurantCredentials:
    return await service.get_token()


@router.get(
    "/settings",
    response_model=UserSettings,
    summary="Consultar as configurações pessoais do usuário",
    responses=SIGAA_ERRORS,
    dependencies=[NoStore],
)
async def get_settings(
    connection: SigaaConnectionDep,
    service: SettingsServiceDep,
) -> UserSettings:
    return await service.get_settings(connection.registration)


@router.patch(
    "/settings",
    response_model=UserSettings,
    summary="Atualizar as configurações pessoais do usuário",
    responses=SIGAA_ERRORS,
)
async def update_settings(
    body: UserSettingsPatch,
    connection: SigaaConnectionDep,
    service: SettingsServiceDep,
) -> UserSettings:
    return await service.update_settings(connection.registration, body)
