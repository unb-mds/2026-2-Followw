from datetime import date
from typing import Annotated, Literal, Self

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field, model_validator
from unb_browser import Campus, DailyMenu

from api.cache import CacheControlDep
from api.modules.public_restaurant.service import Meal, RestaurantServiceDep

router = APIRouter()
_CAMPUSES = {
    "Darcy": Campus.DARCY_RIBEIRO,
    "Gama": Campus.GAMA,
    "Ceilandia": Campus.CEILANDIA,
    "Planaltina": Campus.PLANALTINA,
    "Fazenda": Campus.FAZENDA_AGUA_LIMPA,
}


class MenuQuery(BaseModel):
    campus: Literal[*_CAMPUSES] = Field("Darcy", description="Campus do restaurante.")
    day: date | None = Field(
        None, alias="date", description="Dia específico (AAAA-MM-DD)."
    )
    start_date: date | None = Field(
        None, description="Início do intervalo (AAAA-MM-DD)."
    )
    end_date: date | None = Field(None, description="Fim do intervalo (AAAA-MM-DD).")
    meal: Meal | None = Field(
        None,
        description="Retorna apenas a refeição escolhida e a data. Se não publicada no dia, a refeição é null. Sem filtro, retorna todas.",
    )

    @model_validator(mode="after")
    def _interval(self) -> Self:
        if self.day is not None and (
            self.start_date is not None or self.end_date is not None
        ):
            raise ValueError("Use date or start_date/end_date, not both")
        if (
            self.start_date is not None
            and self.end_date is not None
            and self.start_date > self.end_date
        ):
            raise ValueError("start_date must not be after end_date")
        return self


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
    query: Annotated[MenuQuery, Query()],
) -> tuple[DailyMenu, ...]:
    return await service.get_menu(
        _CAMPUSES[query.campus],
        cache,
        day=query.day,
        start_date=query.start_date,
        end_date=query.end_date,
        meal=query.meal,
    )
