from fastapi import APIRouter
from sigaa_client import RestaurantCredentials, RestaurantStatement

from api.cache import NoStore
from api.db.main import DatabaseDep
from api.errors import SIGAA_ERRORS
from api.modules.me.profile import ProfileServiceDep, UserProfile
from api.modules.me.settings import (
    UserSettings,
    UserSettingsPatch,
    read_settings,
    save_settings,
)
from api.sigaa import SigaaClientDep, SigaaConnectionDep

router = APIRouter()


@router.get(
    "",
    response_model=UserProfile,
    summary="Consultar o perfil do usuário autenticado",
    responses=SIGAA_ERRORS,
)
async def get_me(service: ProfileServiceDep) -> UserProfile:
    return await service.get_profile()


@router.get(
    "/ru-statement",
    response_model=RestaurantStatement,
    summary="Consultar extrato, saldo e grupo do RU",
    responses=SIGAA_ERRORS,
    dependencies=[NoStore],
)
async def get_statement(client: SigaaClientDep) -> RestaurantStatement:
    return await client.restaurant.get_restaurant_statement()


@router.get(
    "/ru-token",
    response_model=RestaurantCredentials,
    summary="Consultar o token da carteirinha estudantil",
    description="Lê o QR code da carteirinha no SIGAA a cada acesso, sem persistência. Retorna token e valid_until; a validade informa mês/ano e o scraper representa o mês pelo dia 1.",
    responses=SIGAA_ERRORS,
    dependencies=[NoStore],
)
async def get_token(client: SigaaClientDep) -> RestaurantCredentials:
    return await client.restaurant.get_restaurant_credentials()


@router.get(
    "/settings",
    response_model=UserSettings,
    summary="Consultar as configurações pessoais do usuário",
    responses=SIGAA_ERRORS,
    dependencies=[NoStore],
)
async def get_settings(connection: SigaaConnectionDep, db: DatabaseDep) -> UserSettings:
    return await read_settings(db, connection.registration)


@router.patch(
    "/settings",
    response_model=UserSettings,
    summary="Atualizar as configurações pessoais do usuário",
    responses=SIGAA_ERRORS,
)
async def update_settings(
    body: UserSettingsPatch,
    connection: SigaaConnectionDep,
    db: DatabaseDep,
) -> UserSettings:
    return await save_settings(db, connection.registration, body)
