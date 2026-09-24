import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict


class Campus(StrEnum):
    DARCY_RIBEIRO = "Darcy Ribeiro"
    CEILANDIA = "Ceilândia"
    GAMA = "Gama"
    PLANALTINA = "Planaltina"
    FAZENDA_AGUA_LIMPA = "Fazenda Água Limpa"


class MenuSection(BaseModel):
    """Uma linha da tabela do cardápio: `Salada 1` -> `("Repolho roxo",)`."""

    model_config = ConfigDict(frozen=True)

    name: str
    items: tuple[str, ...]


class DailyMenu(BaseModel):
    """Refeição que o campus não serve (ou não publicou) no dia vem `None`."""

    model_config = ConfigDict(frozen=True)

    date: datetime.date
    breakfast: tuple[MenuSection, ...] | None = None
    lunch: tuple[MenuSection, ...] | None = None
    dinner: tuple[MenuSection, ...] | None = None
