import asyncio
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


class Restaurant:
    def __init__(self, http: httpx.AsyncClient) -> None:
        self._http = http

    async def get_menu(self, campus: Campus | str) -> tuple[DailyMenu, ...]:
        """Cardápio de todos os dias publicados para o campus, em ordem de data.

        Custa um GET da página + um GET por semana publicada (em paralelo).
        """
        page = await fetch_page(self._http, RU_MENU_URL)
        urls = _menu_urls(page, Campus(campus))

        pdfs = await asyncio.gather(*(fetch_file(self._http, url) for url in urls))
        # Parse de PDF é CPU-bound: fora do event loop.
        weeks = await asyncio.gather(
            *(asyncio.to_thread(parse_menu, pdf) for pdf in pdfs)
        )

        # A página lista as semanas em ordem; se uma data repetir, vale a mais recente.
        days = {menu.date: menu for week in weeks for menu in week}
        return tuple(days[day] for day in sorted(days))


def _menu_urls(page: BeautifulSoup, campus: Campus) -> list[str]:
    heading = lookup_key(f"{_HEADING_PREFIX} {campus}")
    found = in_section = False
    urls = []

    for node in page.find_all(["h3", "a"]):
        if node.name == "h3":
            in_section = lookup_key(node.get_text()) == heading
            found = found or in_section
            continue

        href = node.get("href")
        if in_section and isinstance(href, str) and href.lower().endswith(".pdf"):
            urls.append(urljoin(RU_MENU_URL, href))

    if not found:
        raise UnbParseError(
            f"Seção `{_HEADING_PREFIX} {campus}` não encontrada na página do RU."
        )
    return urls
