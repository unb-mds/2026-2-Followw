import asyncio
import re
from datetime import date, timedelta
from typing import NamedTuple
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup

from ..config import RU_MENU_URL
from ..exceptions import UnbParseError
from ..utils.http import fetch_file, fetch_page
from ..utils.parsing import lookup_key
from .models import Campus, DailyMenu
from .pdf import parse_menu

# Cada campus é um `<h3>Cardápio {campus}</h3>` seguido dos links dos PDFs, um por semana.
_HEADING_PREFIX = "Cardápio"
_DATE_RANGE_RE = re.compile(
    r"(\d{1,2}/\d{1,2}/\d{4})\s*a\s*(\d{1,2}/\d{1,2}/\d{4})", re.IGNORECASE
)


class _MenuLink(NamedTuple):
    url: str
    days: tuple[date, ...]


class Restaurant:
    def __init__(self, http: httpx.AsyncClient) -> None:
        self._http = http

    async def get_menu(self, campus: Campus | str) -> tuple[DailyMenu, ...]:
        """Cardápio de todos os dias publicados para o campus, em ordem de data.

        Custa um GET da página + um GET por semana publicada (em paralelo).
        """
        page = await fetch_page(self._http, RU_MENU_URL)
        links = _menu_links(page, Campus(campus))

        pdfs = await asyncio.gather(
            *(fetch_file(self._http, link.url) for link in links)
        )
        # Parse de PDF é CPU-bound: fora do event loop.
        weeks = await asyncio.gather(
            *(asyncio.to_thread(parse_menu, pdf) for pdf in pdfs)
        )

        # A página lista as semanas em ordem; se uma data repetir, vale a mais recente.
        days = {}
        for link, week in zip(links, weeks, strict=True):
            days.update({day: DailyMenu(date=day) for day in link.days})
            days.update({menu.date: menu for menu in week})
        return tuple(days[day] for day in sorted(days))


def _menu_links(page: BeautifulSoup, campus: Campus) -> list[_MenuLink]:
    heading = lookup_key(f"{_HEADING_PREFIX} {campus}")
    found = in_section = False
    links = []

    for node in page.find_all(["h3", "a"]):
        if node.name == "h3":
            in_section = lookup_key(node.get_text()) == heading
            found = found or in_section
            continue

        href = node.get("href")
        if in_section and isinstance(href, str) and href.lower().endswith(".pdf"):
            links.append(
                _MenuLink(urljoin(RU_MENU_URL, href), _menu_days(node.get_text()))
            )

    if not found:
        raise UnbParseError(
            f"Seção `{_HEADING_PREFIX} {campus}` não encontrada na página do RU."
        )
    return links


def _menu_days(title: str) -> tuple[date, ...]:
    match = _DATE_RANGE_RE.search(title)
    if match is None:
        return ()
    try:
        start, end = (date.strptime(value, "%d/%m/%Y") for value in match.groups())
    except ValueError as error:
        raise UnbParseError(
            f"Período `{title}` inválido no link do cardápio do RU."
        ) from error
    if start > end:
        raise UnbParseError(f"Período `{title}` invertido no link do cardápio do RU.")
    return tuple(
        start + timedelta(days=offset) for offset in range((end - start).days + 1)
    )
