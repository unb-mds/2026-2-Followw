"""Leitura das tabelas dos PDFs de cardápio do RU (uma página por refeição).

As colunas não servem de índice: células mescladas e subcolunas mudam de uma
semana para outra. Tudo é casado pela geometria — cada item vai para os dias
cujo centro está dentro da célula e para a categoria cuja linha a contém.
"""

import datetime
import re
from io import BytesIO
from typing import Any, NamedTuple

import pdfplumber
from pdfplumber.page import Page

from ..exceptions import UnbParseError
from ..utils.parsing import clean_text, lookup_key
from .models import DailyMenu, MenuSection, MenuSectionKey

_DATE_RE = re.compile(r"(\d{1,2})/(\d{1,2})/(\d{4})")

_LABEL_HEADER = "composicao"
_MEALS = {
    "cafedamanha": "breakfast",
    "desjejum": "breakfast",
    "almoco": "lunch",
    "jantar": "dinner",
}

# Chave estável por categoria; `Bebidas` (café) e `Bebida (refresco de)` são a mesma.
_SECTION_KEYS = {
    "bebidas": MenuSectionKey.DRINK,
    "panificacao": MenuSectionKey.BREAD,
    "opcao extra": MenuSectionKey.EXTRA,
    "gordura": MenuSectionKey.SPREAD,
    "complemento padrao": MenuSectionKey.COMPLEMENT,
    "complemento ovolactovegetariano": MenuSectionKey.COMPLEMENT_VEGETARIAN,
    "complemento vegetariano estrito": MenuSectionKey.COMPLEMENT_VEGAN,
    "fruta": MenuSectionKey.FRUIT,
    "salada 1": MenuSectionKey.SALAD_1,
    "salada 2": MenuSectionKey.SALAD_2,
    "molho para salada": MenuSectionKey.SALAD_DRESSING,
    "prato principal padrao": MenuSectionKey.MAIN_DISH,
    "prato principal ovolactovegetariano": MenuSectionKey.MAIN_DISH_VEGETARIAN,
    "prato principal vegetariano estrito": MenuSectionKey.MAIN_DISH_VEGAN,
    "guarnicao": MenuSectionKey.SIDE_DISH,
    "acompanhamentos": MenuSectionKey.ACCOMPANIMENTS,
    "sopa": MenuSectionKey.SOUP,
    "torrada": MenuSectionKey.TOAST,
    "sobremesa": MenuSectionKey.DESSERT,
    "bebida (refresco de)": MenuSectionKey.DRINK,
}

_SHAPES = {"rect", "line", "curve"}
_WHITE = {(1.0,), (1.0, 1.0, 1.0), (0.0, 0.0, 0.0, 0.0)}

_TOLERANCE = 2


class _Cell(NamedTuple):
    x0: float
    top: float
    x1: float
    bottom: float
    text: str

    @property
    def center_x(self) -> float:
        return (self.x0 + self.x1) / 2

    @property
    def center_y(self) -> float:
        return (self.top + self.bottom) / 2

    def spans_x(self, x: float) -> bool:
        return self.x0 - _TOLERANCE <= x <= self.x1 + _TOLERANCE

    def spans_y(self, y: float) -> bool:
        return self.top - _TOLERANCE <= y <= self.bottom + _TOLERANCE


type _Sections = dict[datetime.date, tuple[MenuSection, ...]]


def parse_menu(pdf: bytes) -> tuple[DailyMenu, ...]:
    days: dict[datetime.date, dict[str, tuple[MenuSection, ...] | None]] = {}
    try:
        with pdfplumber.open(BytesIO(pdf)) as document:
            for page in document.pages:
                meal, sections = _parse_page(page)
                for day, day_sections in sections.items():
                    days.setdefault(day, {})[meal] = day_sections or None
    except UnbParseError:
        raise
    except Exception as error:
        raise UnbParseError("PDF do cardápio do RU não pôde ser lido.") from error

    return tuple(DailyMenu(date=day, **meals) for day, meals in sorted(days.items()))


def _parse_page(page: Page) -> tuple[str, _Sections]:
    cells = _cells(page)

    header = next((c for c in cells if lookup_key(c.text) == _LABEL_HEADER), None)
    if header is None:
        raise UnbParseError("Coluna `COMPOSIÇÃO` não encontrada no cardápio do RU.")

    days = _days(cells, header)
    body = [c for c in cells if c.top >= header.bottom - _TOLERANCE]
    labels = sorted((c for c in body if header.spans_x(c.center_x)), key=_by_position)
    values = sorted(
        (c for c in body if c.x0 >= header.x1 - _TOLERANCE), key=_by_position
    )

    items: dict[datetime.date, dict[_Cell, list[str]]] = {
        day: {label: [] for label in labels} for day, _ in days
    }
    for value in values:
        label = next((lb for lb in labels if lb.spans_y(value.center_y)), None)
        if label is None:
            raise UnbParseError(
                f"Item `{value.text}` fora de qualquer categoria do cardápio do RU."
            )
        for day, column in days:
            if value.spans_x(column.center_x):
                items[day][label].append(value.text)

    sections = {
        day: tuple(
            MenuSection(
                key=_SECTION_KEYS.get(lookup_key(label.text)),
                name=label.text.capitalize(),
                items=tuple(texts),
            )
            for label, texts in by_label.items()
            if texts
        )
        for day, by_label in items.items()
    }
    return _meal(cells, header), sections


def _cells(page: Page) -> list[_Cell]:
    tables = page.filter(_is_visible).find_tables()
    if not tables:
        raise UnbParseError("Tabela não encontrada no PDF do cardápio do RU.")

    table = max(tables, key=lambda t: len(t.cells))
    return [
        _Cell(*bbox, clean_text(text))
        for row, texts in zip(table.rows, table.extract(), strict=True)
        for bbox, text in zip(row.cells, texts, strict=True)
        if bbox is not None and text and text.strip()
    ]


def _is_visible(obj: dict[str, Any]) -> bool:
    # Os ícones de alérgenos vêm dentro de retângulos brancos, que o
    # pdfplumber leria como bordas e partiria a célula em várias.
    if obj["object_type"] not in _SHAPES:
        return True

    painted = []
    if obj.get("stroke"):
        painted.append(obj.get("stroking_color"))
    if obj.get("fill"):
        painted.append(obj.get("non_stroking_color"))
    return any(_color(color) not in _WHITE for color in painted)


def _color(value: object) -> object:
    if isinstance(value, int | float):
        return (float(value),)
    if isinstance(value, tuple | list):
        return tuple(float(c) if isinstance(c, int | float) else c for c in value)
    return value


def _days(cells: list[_Cell], header: _Cell) -> list[tuple[datetime.date, _Cell]]:
    days = []
    for cell in cells:
        match = _DATE_RE.search(cell.text)
        if match is None or cell.center_y > header.bottom:
            continue
        day, month, year = map(int, match.groups())
        try:
            days.append((datetime.date(year, month, day), cell))
        except ValueError as error:
            raise UnbParseError(
                f"Data `{match.group()}` inválida no cardápio do RU."
            ) from error

    if not days:
        raise UnbParseError("Datas não encontradas no cabeçalho do cardápio do RU.")
    return days


def _meal(cells: list[_Cell], header: _Cell) -> str:
    # O nome da refeição é um texto vertical à esquerda de `COMPOSIÇÃO`, que o
    # pdfplumber lê de trás pra frente (`ã h n a m a d é f a C`).
    text = "".join(c.text for c in cells if c.x1 <= header.x0 + _TOLERANCE)
    key = lookup_key(text).replace(" ", "")
    for name, meal in _MEALS.items():
        if name in key or name in key[::-1]:
            return meal
    raise UnbParseError(f"Refeição `{text}` desconhecida no cardápio do RU.")


def _by_position(cell: _Cell) -> tuple[float, float]:
    return cell.top, cell.x0
