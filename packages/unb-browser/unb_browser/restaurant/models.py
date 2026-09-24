import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict


class Campus(StrEnum):
    DARCY_RIBEIRO = "Darcy Ribeiro"
    CEILANDIA = "Ceilândia"
    GAMA = "Gama"
    PLANALTINA = "Planaltina"
    FAZENDA_AGUA_LIMPA = "Fazenda Água Limpa"


class MenuSectionKey(StrEnum):
    DRINK = "drink"
    BREAD = "bread"
    EXTRA = "extra"
    SPREAD = "spread"
    COMPLEMENT = "complement"
    COMPLEMENT_VEGETARIAN = "complement_vegetarian"
    COMPLEMENT_VEGAN = "complement_vegan"
    FRUIT = "fruit"
    SALAD_1 = "salad_1"
    SALAD_2 = "salad_2"
    SALAD_DRESSING = "salad_dressing"
    MAIN_DISH = "main_dish"
    MAIN_DISH_VEGETARIAN = "main_dish_vegetarian"
    MAIN_DISH_VEGAN = "main_dish_vegan"
    SIDE_DISH = "side_dish"
    ACCOMPANIMENTS = "accompaniments"
    SOUP = "soup"
    TOAST = "toast"
    DESSERT = "dessert"


class MenuSection(BaseModel):
    # Uma linha da tabela do cardápio: `Salada 1` -> `("Repolho roxo",)`.

    model_config = ConfigDict(frozen=True)

    key: MenuSectionKey | None = None
    name: str
    items: tuple[str, ...]


class DailyMenu(BaseModel):
    """Refeição que o campus não serve (ou não publicou) no dia vem `None`."""

    model_config = ConfigDict(frozen=True)

    date: datetime.date
    breakfast: tuple[MenuSection, ...] | None = None
    lunch: tuple[MenuSection, ...] | None = None
    dinner: tuple[MenuSection, ...] | None = None
