from datetime import date, timedelta
from typing import Annotated, Literal, Self

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field, model_validator
from unb_browser import Campus, DailyMenu

from api.cache import CacheControlDep
from api.modules.public_restaurant.service import (
    Meal,
    RestaurantServiceDep,
    menu_window,
)

router = APIRouter()
_MAX_DAYS = 14
_CAMPUSES = {
    "Darcy": Campus.DARCY_RIBEIRO,
    "Gama": Campus.GAMA,
    "Ceilandia": Campus.CEILANDIA,
    "Planaltina": Campus.PLANALTINA,
    "Fazenda": Campus.FAZENDA_AGUA_LIMPA,
}


class MenuQuery(BaseModel):
    campus: Literal[*_CAMPUSES] = Field("Darcy", description="Campus do restaurante.")
    day: date | None = Field(None, alias="date", description="Dia do cardápio.")
    start_date: date | None = Field(None, description="Início do intervalo.")
    end_date: date | None = Field(None, description="Fim do intervalo.")
    meal: Meal | None = Field(
        None,
        description="Refeição desejada; null quando não publicada no dia.",
    )

    @model_validator(mode="after")
    def _interval(self) -> Self:
        if self.day is not None and (
            self.start_date is not None or self.end_date is not None
        ):
            raise ValueError("Use date or start_date/end_date, not both")
        first, last = menu_window()
        for value in (self.day, self.start_date, self.end_date):
            if value is not None and not first <= value <= last:
                raise ValueError(f"Dates must be between {first} and {last}")
        if self.start_date is None or self.end_date is None:
            return self
        if self.start_date > self.end_date:
            raise ValueError("start_date must not be after end_date")
        if self.end_date - self.start_date >= timedelta(days=_MAX_DAYS):
            raise ValueError(f"The interval must have at most {_MAX_DAYS} days")
        return self


@router.get(
    "",
    response_model=tuple[DailyMenu, ...],
    response_model_exclude_unset=True,
    summary="Consultar cardápio do RU",
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
