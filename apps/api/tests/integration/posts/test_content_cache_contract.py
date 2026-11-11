from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from api.cache import CacheControlDep, Freshness
from api.sync import Cached, Sync


@pytest.mark.parametrize("loaded", [False, True])
@pytest.mark.parametrize("directive", [None, "max-age=0", "no-cache"])
def test_conteudo_imutavel_so_reconsulta_com_no_cache(probe_app, loaded, directive):
    value = "Salvo" if loaded else None
    fetch = AsyncMock(return_value="Atualizado")
    sigaa = SimpleNamespace(client=AsyncMock(return_value=object()))

    async def read(load):
        return await load(None)

    async def load(session):
        if value is None:
            return None
        return Cached(value, datetime.now(UTC) - timedelta(days=365), Freshness.FRESH)

    async def task(ctx):
        nonlocal value
        value = await fetch()

    async def consultar(cache: CacheControlDep) -> str:
        sync = Sync(SimpleNamespace(read=read), sigaa, cache)
        result = await sync.resolve(task, None, load, immutable=True)
        assert sync.jobs() == []
        return result

    headers = {"Cache-Control": directive} if directive else {}
    response = probe_app(consultar).get("/probe", headers=headers)
    expected_fetch = not loaded or directive == "no-cache"
    assert response.status_code == 200
    assert response.json() == ("Atualizado" if expected_fetch else "Salvo")
    assert fetch.await_count == int(expected_fetch)
    assert sigaa.client.await_count == int(expected_fetch)
