from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Query
from unb_browser import Campus, DailyMenu

from api.dependencies.cache import CacheControlDep
from api.services.restaurant import Meal, RestaurantServiceDep

router = APIRouter()
_CAMPUSES = {
    "Darcy": Campus.DARCY_RIBEIRO,
    "Gama": Campus.GAMA,
    "Ceilandia": Campus.CEILANDIA,
    "Planaltina": Campus.PLANALTINA,
    "Fazenda": Campus.FAZENDA_AGUA_LIMPA,
}


@router.get(
    "",
    response_model=tuple[DailyMenu, ...],
    response_model_exclude_unset=True,
    summary="Consultar o cardápio público do RU",
    description="",
    responses={502: {"description": "Site do RU indisponível ou cardápio ilegível."}},
)
async def get_menu(
    service: RestaurantServiceDep,
    cache: CacheControlDep,
    campus: Annotated[
        Literal[*_CAMPUSES], Query(description="Campus do restaurante.")
    ] = "Darcy",
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
        cache,
        day=day,
        start_date=start_date,
        end_date=end_date,
        meal=meal,
    )
