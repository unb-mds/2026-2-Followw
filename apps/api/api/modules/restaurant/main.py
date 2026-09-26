from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Query, Response
from sigaa_client import RestaurantCredentials, RestaurantStatement
from unb_browser import Campus, DailyMenu

from api.dependencies.refresh import RefreshQuery
from api.services.restaurant import (
    Meal,
    RestaurantAccountServiceDep,
    RestaurantServiceDep,
)

router = APIRouter()
_CAMPUSES = {
    "Darcy": Campus.DARCY_RIBEIRO,
    "Gama": Campus.GAMA,
    "Ceilandia": Campus.CEILANDIA,
    "Planaltina": Campus.PLANALTINA,
    "Fazenda": Campus.FAZENDA_AGUA_LIMPA,
}
PRIVATE_ERRORS = {
    401: {"description": "Credenciais ausentes ou inválidas."},
    502: {"description": "SIGAA indisponível."},
}


@router.get(
    "/menu",
    response_model=tuple[DailyMenu, ...],
    response_model_exclude_unset=True,
    summary="Consultar o cardápio público do RU",
    description="",
    responses={502: {"description": "Site do RU indisponível ou cardápio ilegível."}},
)
async def get_menu(
    service: RestaurantServiceDep,
    campus: Annotated[
        Literal[*_CAMPUSES], Query(description="Campus do restaurante.")
    ] = "Darcy",
    refresh: RefreshQuery = False,
    day: Annotated[
        date | None, Query(alias="date", description="Dia específico (AAAA-MM-DD).")
    ] = None,
    start_date: Annotated[
        date | None, Query(description="Início do intervalo (AAAA-MM-DD).")
    ] = None,
    end_date: Annotated[
        date | None, Query(description="Fim do intervalo (AAAA-MM-DD).")
    ] = None,
    meal: Annotated[
        Meal | None,
        Query(
            description="Retorna apenas a refeição escolhida e a data. Se não publicada no dia, a refeição é null. Sem filtro, retorna todas."
        ),
    ] = None,
) -> tuple[DailyMenu, ...]:
    return await service.get_menu(
        _CAMPUSES[campus],
        refresh=refresh,
        day=day,
        start_date=start_date,
        end_date=end_date,
        meal=meal,
    )


@router.get(
    "/statement",
    response_model=RestaurantStatement,
    summary="Consultar extrato, saldo e grupo do estudante no RU",
    description="",
    responses=PRIVATE_ERRORS,
)
async def get_statement(
    service: RestaurantAccountServiceDep, response: Response
) -> RestaurantStatement:
    response.headers["Cache-Control"] = "no-store"
    return await service.get_statement()


@router.get(
    "/token",
    response_model=RestaurantCredentials,
    summary="Consultar o token da carteirinha estudantil",
    description="Lê o QR code da carteirinha no SIGAA a cada acesso, sem persistência. Retorna token e valid_until; a validade informa mês/ano e o scraper representa o mês pelo dia 1.",
    responses=PRIVATE_ERRORS,
)
async def get_token(
    service: RestaurantAccountServiceDep, response: Response
) -> RestaurantCredentials:
    response.headers["Cache-Control"] = "no-store"
    return await service.get_token()
