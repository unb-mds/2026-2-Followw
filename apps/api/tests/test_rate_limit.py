import asyncio
import hmac
import json
from collections import Counter
from unittest.mock import AsyncMock

import httpx
import pytest
import respx
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sigaa_client import Credentials
from upstash_redis.asyncio import Redis

from api.core.config import Settings, settings
from api.main import app
from api.rate_limit import RateLimitMiddleware

REDIS_URL = "https://redis.followw.test"


def _forwarded(address, timestamp=120):
    client = f"{timestamp}:{address}"
    return {
        "X-Followw-Client": client,
        "X-Followw-Client-Signature": hmac.digest(
            settings.jwt_secret_key.encode(),
            f"followw:rate-limit:{client}".encode(),
            "sha256",
        ).hex(),
    }


@pytest.fixture
def redis(monkeypatch):
    monkeypatch.setattr(settings, "upstash_redis_rest_url", REDIS_URL)
    monkeypatch.setattr(settings, "upstash_redis_rest_token", "redis-secret")
    monkeypatch.setattr(settings, "rate_limit_requests", 2)
    monkeypatch.setattr(settings, "rate_limit_login_requests", 1)
    monkeypatch.setattr(settings, "rate_limit_window_seconds", 60)
    monkeypatch.setattr("upstash_ratelimit.limiter.now_ms", lambda: 120_000)
    monkeypatch.setattr("api.rate_limit.time", lambda: 120)
    monkeypatch.delenv("VERCEL", raising=False)
    counts = Counter()

    def respond(request):
        command = json.loads(request.content)
        assert command[0] == "EVAL"
        assert command[2] == 1
        assert command[4:] == [60_000, 1]
        assert request.headers["authorization"] == "Bearer redis-secret"
        key = command[3]
        counts[key] += 1
        return httpx.Response(200, json={"result": counts[key]})

    with respx.mock(assert_all_called=False) as router:
        yield router.post(REDIS_URL).mock(side_effect=respond)


def test_limita_requisicoes_entre_rotas_e_renova_a_janela(redis, monkeypatch):
    client = TestClient(app)
    assert client.get("/docs").status_code == 200
    assert client.get("/openapi.json").status_code == 200

    response = client.get("/api/docs?outro=parametro")
    assert response.status_code == 429
    assert response.json() == {"detail": "Too many requests"}
    assert response.headers["retry-after"] == "60"
    assert response.headers["cache-control"] == "no-store"

    monkeypatch.setattr("upstash_ratelimit.limiter.now_ms", lambda: 180_000)
    assert client.get("/docs").status_code == 200


def test_cotas_sao_compartilhadas_entre_clients_mas_separadas_por_ip(redis):
    first = TestClient(app, client=("203.0.113.1", 50000))
    same_ip = TestClient(app, client=("203.0.113.1", 50001))
    other_ip = TestClient(app, client=("203.0.113.2", 50000))

    assert first.get("/docs").status_code == 200
    assert same_ip.get("/docs").status_code == 200
    assert first.get("/docs").status_code == 429
    assert other_ip.get("/docs").status_code == 200
    assert "203.0.113" not in str([call.request.content for call in redis.calls])


@pytest.mark.parametrize("path", ["/auth/sigaa", "/api/auth/sigaa"])
def test_login_tem_cota_propria_e_conta_tentativas_invalidas(redis, path):
    client = TestClient(app)
    assert client.post(path, json={}).status_code == 422
    assert client.post(path, json={}).status_code == 429
    assert client.get("/docs").status_code == 200
    assert client.delete("/auth/sigaa").status_code == 200


def test_cors_funciona_quando_a_cota_esgota_e_preflight_nao_consulta_redis(redis):
    client = TestClient(app)
    for _ in range(2):
        client.get("/docs")
    response = client.get("/docs", headers={"Origin": "https://followw.app"})
    assert response.status_code == 429
    assert response.headers["access-control-allow-origin"] == "https://followw.app"
    assert "Retry-After" in response.headers["access-control-expose-headers"]

    calls = redis.call_count
    preflight = client.options(
        "/me",
        headers={
            "Origin": "https://followw.app",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert preflight.status_code == 200
    assert redis.call_count == calls


@pytest.mark.parametrize("path", ["/jobs", "/api/jobs", "/jobs/"])
def test_jobs_nao_consultam_redis_e_continuam_exigindo_assinatura(redis, path):
    response = TestClient(app).post(path, content="nao-e-um-job")
    assert response.status_code == 422
    assert redis.call_count == 0


@pytest.mark.parametrize(
    "field", ["upstash_redis_rest_url", "upstash_redis_rest_token"]
)
def test_sem_configuracao_redis_a_api_funciona_sem_consulta(redis, monkeypatch, field):
    monkeypatch.setattr(settings, field, "")
    for _ in range(3):
        assert TestClient(app).get("/docs").status_code == 200
    assert redis.call_count == 0


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(401, json={"error": "redis-secret"}),
        httpx.Response(503, text="indisponivel"),
        httpx.Response(200, json={"error": "redis-secret"}),
        httpx.Response(200, json={"result": None}),
    ],
)
def test_falha_redis_libera_requisicao_sem_vazar_segredos(redis, caplog, response):
    redis.mock(return_value=response)
    assert TestClient(app).get("/docs").status_code == 200
    assert redis.call_count == 1
    assert "rate_limit.unavailable" in caplog.text
    assert "redis-secret" not in caplog.text


def test_falha_de_rede_libera_requisicao_sem_retentar(redis):
    redis.mock(side_effect=httpx.ConnectError("fora do ar"))
    assert TestClient(app).get("/docs").status_code == 200
    assert redis.call_count == 1


def test_timeout_cancela_consulta_e_libera_requisicao(redis, monkeypatch, caplog):
    async def stalled(request):
        await asyncio.Event().wait()

    redis.mock(side_effect=stalled)
    monkeypatch.setattr(settings, "redis_timeout_seconds", 0.01)
    assert TestClient(app).get("/docs").status_code == 200
    assert '"error_type": "TimeoutError"' in caplog.text


def test_fecha_conexao_redis_apos_cada_requisicao(redis, monkeypatch):
    close = AsyncMock(wraps=Redis.close)

    async def closed(client):
        await close(client)

    monkeypatch.setattr(Redis, "close", closed)
    for _ in range(3):
        TestClient(app).get("/docs")
    assert close.await_count == 3
    assert len({id(call.args[0]) for call in close.await_args_list}) == 3


def test_falha_ao_fechar_redis_nao_derruba_api(redis, monkeypatch):
    close = Redis.close

    async def failed_close(client):
        await close(client)
        raise OSError("falha ao fechar")

    monkeypatch.setattr(Redis, "close", failed_close)
    assert TestClient(app).get("/docs").status_code == 200


def test_cabecalhos_de_ip_falsos_nao_trocam_a_cota_fora_da_vercel(redis):
    client = TestClient(app)
    for ip in ("203.0.113.1", "203.0.113.2"):
        assert (
            client.get(
                "/docs", headers={"X-Forwarded-For": ip, "X-Vercel-Forwarded-For": ip}
            ).status_code
            == 200
        )
    assert client.get("/docs").status_code == 429


def test_na_vercel_usa_ip_definido_pela_plataforma(redis, monkeypatch):
    monkeypatch.setenv("VERCEL", "1")
    client = TestClient(app)
    headers = {"X-Vercel-Forwarded-For": "203.0.113.1"}
    for _ in range(2):
        assert client.get("/docs", headers=headers).status_code == 200
    assert client.get("/docs", headers=headers).status_code == 429
    assert (
        client.get(
            "/docs", headers={"X-Vercel-Forwarded-For": "203.0.113.2"}
        ).status_code
        == 200
    )


def test_ssr_preserva_cota_do_ip_original_e_compartilha_com_acesso_direto(redis):
    proxy = TestClient(app, client=("198.51.100.1", 50000))
    direct = TestClient(app, client=("203.0.113.1", 50000))
    # Vetor compartilhado com o teste do assinador TypeScript.
    alice = {
        "X-Followw-Client": "120:203.0.113.1",
        "X-Followw-Client-Signature": "cf2d59c353d91bae0e0089de0020b361cc37be323297c61030ce640b9d60ec13",
    }
    assert proxy.get("/docs", headers=alice).status_code == 200
    assert direct.get("/docs").status_code == 200
    assert proxy.get("/docs", headers=alice).status_code == 429
    assert proxy.get("/docs", headers=_forwarded("203.0.113.2")).status_code == 200


def test_ipv6_equivalentes_compartilham_cota_direta_e_ssr(redis):
    direct = TestClient(app, client=("2001:0db8:0000::1", 50000))
    proxy = TestClient(app)
    assert direct.get("/docs").status_code == 200
    headers = _forwarded("2001:db8::1")
    assert proxy.get("/docs", headers=headers).status_code == 200
    assert direct.get("/docs").status_code == 429


@pytest.mark.parametrize(
    "headers",
    [
        {"X-Followw-Client": "120:203.0.113.1"},
        {**_forwarded("203.0.113.1"), "X-Followw-Client": "120:203.0.113.2"},
        _forwarded("203.0.113.1", timestamp=59),
        _forwarded("203.0.113.1", timestamp=181),
        _forwarded("endereco-invalido"),
        _forwarded("203.0.113.1", timestamp="nan"),
        _forwarded("203.0.113.1", timestamp="9" * 400),
    ],
)
def test_encaminhamento_invalido_nao_permite_trocar_cota(redis, headers):
    client = TestClient(app)
    assert client.get("/docs").status_code == 200
    assert client.get("/docs").status_code == 200
    assert client.get("/docs", headers=headers).status_code == 429


@pytest.mark.parametrize("path", ["/auth/sigaa", "/api/auth/sigaa", "/auth/sigaa/"])
def test_logout_apaga_cookies_mesmo_com_cota_esgotada(
    redis, sigaa, cookies, ler_cookies, path
):
    client = TestClient(app)
    client.cookies.update(
        cookies(
            access="sessao-do-teste",
            refresh=Credentials(registration="251000000", password="senha123"),
        )
    )
    for _ in range(2):
        assert client.get("/docs").status_code == 200
    assert client.get("/docs").status_code == 429
    calls = redis.call_count

    response = client.delete(path)

    assert response.status_code == 200
    assert sigaa.logouts == 1
    assert redis.call_count == calls
    assert {
        name
        for name, cookie in ler_cookies(response).items()
        if cookie["max-age"] == "0"
    } == {"access_token", "refresh_token"}


def test_falha_da_rota_nao_e_confundida_com_falha_redis(redis):
    probe = FastAPI()
    probe.add_middleware(RateLimitMiddleware)

    @probe.get("/probe")
    async def failed():
        raise RuntimeError("falha da rota")

    with pytest.raises(RuntimeError, match="falha da rota"):
        TestClient(probe).get("/probe")


@pytest.mark.parametrize(
    "field,value",
    [
        ("rate_limit_requests", 0),
        ("rate_limit_login_requests", -1),
        ("rate_limit_window_seconds", 0),
        ("redis_timeout_seconds", 0),
        ("redis_timeout_seconds", float("inf")),
    ],
)
def test_configuracao_recusa_limites_invalidos(field, value):
    with pytest.raises(ValidationError):
        Settings(**{**settings.model_dump(), field: value})
