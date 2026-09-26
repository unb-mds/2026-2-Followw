from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Query, Response
from sigaa_client import RestaurantCredentials
from unb_browser import Campus, DailyMenu

from api.dependencies.refresh import RefreshQuery
from api.services.restaurant import (
    Meal,
    RestaurantAccountServiceDep,
    RestaurantServiceDep,
    RestaurantStatement,
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
    summary="Consultar o cardápio público do RU por campus",
    description="Retorna os dias publicados, em ordem de data. Use date para um dia ou start_date/end_date para um intervalo inclusivo, no formato AAAA-MM-DD. Não combine date com intervalo. Sem datas, retorna tudo; sem resultados, retorna []. Cache completo por campus por 6 horas; refresh=true força a consulta ao RU. Falhas no banco não impedem a resposta obtida do site. Não exige login.",
    responses={502: {"description": "Site do RU indisponível ou cardápio ilegível."}},
)
async def get_menu(
    service: RestaurantServiceDep,
    campus: Annotated[
        Literal["Darcy", "Gama", "Ceilandia", "Planaltina", "Fazenda"],
        Query(description="Campus do restaurante."),
    ] = "Darcy",
    refresh: RefreshQuery = False,
    day: Annotated[
        date | None, Query(alias="date", description="Dia específico (AAAA-MM-DD).")
    ] = None,
    start_date: Annotated[
        date | None, Query(description="Primeiro dia, inclusive (AAAA-MM-DD).")
    ] = None,
    end_date: Annotated[
        date | None, Query(description="Último dia, inclusive (AAAA-MM-DD).")
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
    description="Consulta o SIGAA a cada acesso, sem persistência. Saldo vem da linha de saldo mais recente, e grupo (1, 2 ou 3) da descrição mais recente que informa o grupo. Dados ausentes são null; sem extrato, entries é []. Valores monetários são strings decimais para preservar precisão.",
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
