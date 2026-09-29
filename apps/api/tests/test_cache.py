from datetime import UTC, datetime, timedelta

import pytest
from fastapi import Response

from api.dependencies.cache import CacheControl

AGORA = datetime.now(UTC)


@pytest.mark.parametrize(
    "header,esperado",
    [
        (None, CacheControl()),
        ("", CacheControl()),
        ("no-cache", CacheControl(no_cache=True)),
        ("max-age=0", CacheControl(max_age=timedelta(0))),
        (
            "MAX-AGE=60, Stale-If-Error",
            CacheControl(max_age=timedelta(seconds=60), stale_if_error=timedelta.max),
        ),
        ('stale-if-error="30"', CacheControl(stale_if_error=timedelta(seconds=30))),
        ("only-if-cached", CacheControl(only_if_cached=True)),
        # Valor inválido vale como diretiva ausente.
        ("max-age=abc, max-age=-1, private", CacheControl()),
    ],
)
def test_le_as_diretivas_da_requisicao(header, esperado):
    assert CacheControl.parse(header) == esperado


@pytest.mark.parametrize(
    "header,idade,revalida",
    [
        (None, timedelta(days=30), False),
        ("no-cache", timedelta(0), True),
        ("max-age=0", timedelta(0), True),
        ("max-age=60", timedelta(seconds=30), False),
        ("max-age=60", timedelta(seconds=90), True),
    ],
)
def test_revalida_quando_o_cliente_pede(header, idade, revalida):
    assert CacheControl.parse(header).revalidate(AGORA - idade) is revalida


@pytest.mark.parametrize(
    "header,idade,aceita",
    [
        ("no-cache", timedelta(0), False),
        ("stale-if-error", timedelta(days=365), True),
        ("stale-if-error=60", timedelta(seconds=30), True),
        ("stale-if-error=60", timedelta(seconds=90), False),
    ],
)
def test_stale_if_error_limita_a_idade_do_cache(header, idade, aceita):
    assert CacheControl.parse(header).accepts_stale(AGORA - idade) is aceita


def test_age_da_resposta_e_o_do_dado_mais_velho():
    response = Response()
    cache = CacheControl.parse(None, response)

    cache.served(AGORA - timedelta(seconds=100))
    cache.served(AGORA - timedelta(seconds=10))

    assert 100 <= int(response.headers["age"]) < 110
    # Sem resposta (uso interno), não há onde marcar.
    CacheControl().served(AGORA)


def test_sqlite_sem_fuso_vale_como_utc():
    cache = CacheControl.parse("max-age=60")

    assert not cache.revalidate(AGORA.replace(tzinfo=None))


@pytest.mark.parametrize(
    "path",
    [
        "/news",
        "/classrooms/{classroom_id}/news",
        "/classrooms/{classroom_id}/news/{news_id}",
        "/me/ru-statement",
        "/me/ru-token",
        "/public/classrooms",
        "/public/classrooms/units",
    ],
)
def test_rotas_sem_cache_nao_documentam_diretivas(client, path):
    route = client.get("/openapi.json").json()["paths"][path]["get"]

    assert not any(p["name"] == "Cache-Control" for p in route.get("parameters", []))


@pytest.mark.parametrize(
    "path",
    [
        "/me",
        "/classrooms",
        "/classrooms/frequency",
        "/classrooms/{classroom_id}/frequency",
        "/classrooms/{classroom_id}/members",
        "/classrooms/{classroom_id}/statistics",
        "/public/restaurant",
    ],
)
def test_rotas_com_cache_documentam_o_header(client, path):
    route = client.get("/openapi.json").json()["paths"][path]["get"]
    parametros = {p["name"]: p for p in route["parameters"]}

    assert parametros["Cache-Control"]["in"] == "header"
    assert "refresh" not in parametros
