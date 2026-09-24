"""Leitura de páginas e arquivos dos sites da UnB."""

import httpx
from bs4 import BeautifulSoup


async def fetch_page(http: httpx.AsyncClient, url: str) -> BeautifulSoup:
    response = await http.get(url)
    response.raise_for_status()
    return BeautifulSoup(response.text, "lxml")


async def fetch_file(http: httpx.AsyncClient, url: str) -> bytes:
    response = await http.get(url)
    response.raise_for_status()
    return response.content
