import asyncio
from collections.abc import Awaitable, Callable

import httpx
from bs4 import BeautifulSoup

from ..config import PUBLIC_HOME_PATH
from ..exceptions import SessionExpired


class PublicSession:
    """Sessão anônima do SIGAA — a contraparte sem login de `private.Session`.

    Não há credencial aqui, mas há um ritual: o JSF guarda a view na sessão e só
    a aceita de volta se ela já passou pela home pública. Sem esse aquecimento
    todo submit é descartado e o SIGAA devolve a home com "a página que se está
    tentando acessar não está mais ativa".
    """

    def __init__(self, http: httpx.AsyncClient) -> None:
        self._http = http
        self._lock = asyncio.Lock()
        self._ready = False

    async def open(self, path: str) -> BeautifulSoup:
        await self._warm_up()
        response = await self._http.get(path)
        response.raise_for_status()
        return BeautifulSoup(response.text, "lxml")

    async def submit(self, action: str, payload: dict[str, str]) -> BeautifulSoup:
        await self._warm_up()
        response = await self._http.post(action, data=payload)
        response.raise_for_status()

        if PUBLIC_HOME_PATH in str(response.url):
            raise SessionExpired("O SIGAA descartou a view: sessão pública expirada.")
        return BeautifulSoup(response.text, "lxml")

    async def retry[T](self, step: Callable[[], Awaitable[T]]) -> T:
        """Roda `step`; se a sessão expirar, abre outra e refaz o caminho inteiro uma vez.

        `step` precisa reabrir o form: o `ViewState` da mão morre junto com a sessão.
        """
        try:
            return await step()
        except SessionExpired:
            self._ready = False
            self._http.cookies.clear()
            return await step()

    async def _warm_up(self) -> None:
        if self._ready:
            return

        async with self._lock:
            if self._ready:
                return
            response = await self._http.get(PUBLIC_HOME_PATH)
            response.raise_for_status()
            self._ready = True
