from datetime import UTC, datetime, timedelta

import jwt
import pytest
from fastapi import Request, Response
from pydantic import SecretStr
from sigaa_client import Credentials

from api.core.config import settings
from api.utils.session import (
    ACCESS_COOKIE_NAME,
    REFRESH_COOKIE_NAME,
    clear_cookies,
    read_access_cookie,
    read_refresh_cookie,
    set_access_cookie,
    set_refresh_cookie,
)

CREDENCIAIS = Credentials(registration="251000000", password=SecretStr("senha"))


def _request(**cookies: str) -> Request:
    header = "; ".join(f"{k}={v}" for k, v in cookies.items())
    return Request(scope={"type": "http", "headers": [(b"cookie", header.encode())]})


def _assinar(payload: dict, key: str | None = None) -> str:
    return jwt.encode(
        payload, key or settings.jwt_secret_key, algorithm=settings.jwt_algorithm
    )


def test_access_cookie_vai_e_volta(ler_cookies):
    response = Response()
    set_access_cookie(response, "app14~TOKEN1")

    valores = {nome: m.value for nome, m in ler_cookies(response).items()}
    assert read_access_cookie(_request(**valores)) == "app14~TOKEN1"


def test_refresh_cookie_devolve_as_credenciais(ler_cookies):
    response = Response()
    set_refresh_cookie(response, CREDENCIAIS)

    valores = {nome: m.value for nome, m in ler_cookies(response).items()}
    lidas = read_refresh_cookie(_request(**valores))

    assert lidas == CREDENCIAIS
    assert lidas.password.get_secret_value() == "senha"


def test_cookies_ausentes_nao_quebram():
    request = _request()

    assert read_access_cookie(request) is None
    assert read_refresh_cookie(request) is None


@pytest.mark.parametrize(
    "token",
    [
        pytest.param(
            _assinar({"session_token": "x"}, "outra-chave-bem-comprida-para-o-hmac"),
            id="outra-assinatura",
        ),
        pytest.param("nao-e-um-jwt", id="nao-e-jwt"),
        pytest.param(
            _assinar(
                {"session_token": "x", "exp": datetime.now(UTC) - timedelta(minutes=1)}
            ),
            id="expirado",
        ),
    ],
)
def test_access_cookie_invalido_vira_none(token: str):
    assert read_access_cookie(_request(**{ACCESS_COOKIE_NAME: token})) is None


def test_refresh_cookie_sem_senha_vira_none():
    """Cookie assinado por nós, mas com formato antigo: não pode virar exceção."""
    token = _assinar(
        {
            "registration": "251000000",
            "exp": datetime.now(UTC) + timedelta(minutes=5),
        }
    )

    assert read_refresh_cookie(_request(**{REFRESH_COOKIE_NAME: token})) is None


def test_cookies_sao_httponly_e_lax(ler_cookies):
    response = Response()
    set_access_cookie(response, "app14~TOKEN1")

    morsel = ler_cookies(response)[ACCESS_COOKIE_NAME]
    assert morsel["httponly"]
    assert morsel["samesite"] == "lax"
    assert int(morsel["max-age"]) == settings.access_token_expire_minutes * 60


def test_secure_so_em_producao(ler_cookies, monkeypatch: pytest.MonkeyPatch):
    """Em desenvolvimento a API roda em HTTP puro e o navegador descartaria."""
    response = Response()
    set_access_cookie(response, "app14~TOKEN1")
    assert not ler_cookies(response)[ACCESS_COOKIE_NAME]["secure"]

    monkeypatch.setattr(settings, "environment", "production")
    response = Response()
    set_access_cookie(response, "app14~TOKEN1")
    assert ler_cookies(response)[ACCESS_COOKIE_NAME]["secure"]


def test_refresh_vive_mais_que_o_access(ler_cookies):
    response = Response()
    set_access_cookie(response, "app14~TOKEN1")
    set_refresh_cookie(response, CREDENCIAIS)

    jar = ler_cookies(response)
    validade = {
        nome: jwt.decode(morsel.value, options={"verify_signature": False})["exp"]
        for nome, morsel in jar.items()
    }

    assert validade[REFRESH_COOKIE_NAME] > validade[ACCESS_COOKIE_NAME]


def test_clear_cookies_apaga_os_dois(ler_cookies):
    response = Response()
    clear_cookies(response)

    jar = ler_cookies(response)
    assert {nome: morsel.value for nome, morsel in jar.items()} == {
        ACCESS_COOKIE_NAME: "",
        REFRESH_COOKIE_NAME: "",
    }
