import logging
import os
from http.cookies import SimpleCookie

import pytest
from sigaa_client import Credentials

QSTASH_SIGNING_KEY = "sig_atual_de_teste_com_32_bytes_ou_mais"

# O `Settings` é instanciado no import de `api.core.config`, então as variáveis
# precisam existir antes de qualquer teste importar a app.
os.environ["ENVIRONMENT"] = "testing"
os.environ["CORS_ORIGINS"] = '["https://followw.app"]'
os.environ["DATABASE_URL"] = (
    "postgresql+asyncpg://postgres:postgres@localhost:5432/followw_test"
)
os.environ["JWT_SECRET_KEY"] = "chave-de-teste-nao-usar-em-producao"
os.environ["PUBLIC_URL"] = "https://api.followw.test"

os.environ["QSTASH_URL"] = "https://qstash.upstash.io"
os.environ["QSTASH_TOKEN"] = "token-de-teste"
os.environ["QSTASH_CURRENT_SIGNING_KEY"] = QSTASH_SIGNING_KEY
os.environ["QSTASH_NEXT_SIGNING_KEY"] = "sig_proxima_de_teste_com_32_bytes_ou_mais"
os.environ["UPSTASH_REDIS_REST_URL"] = ""
os.environ["UPSTASH_REDIS_REST_TOKEN"] = ""


@pytest.fixture
def caplog(caplog):
    logger = logging.getLogger("followw")
    logger.addHandler(caplog.handler)
    try:
        yield caplog
    finally:
        logger.removeHandler(caplog.handler)


@pytest.fixture(autouse=True)
def hoje(monkeypatch):
    """Fixa o dia do calendário acadêmico: 2026.2 entre a matrícula extraordinária e
    o fim do trancamento geral. Chame com outra data (ou data e hora) para mudar o dia."""
    from datetime import date, datetime
    from zoneinfo import ZoneInfo

    def _set(day: date | datetime) -> None:
        if not isinstance(day, datetime):
            day = datetime.combine(day, datetime.min.time())
        at = day.replace(tzinfo=ZoneInfo("America/Sao_Paulo"))
        monkeypatch.setattr("api.academic_calendar.now", lambda: at)

    _set(date(2026, 9, 22))
    return _set


@pytest.fixture
def cookies():
    """Monta os cookies de sessão como a própria app os emitiria."""
    # Importado aqui dentro: `api.core.config` lê o ambiente já no import.
    from fastapi import Response

    from api.cookies import set_access_cookie, set_refresh_cookie

    def _build(
        *, access: str | None = None, refresh: Credentials | None = None
    ) -> dict[str, str]:
        response = Response()
        if access is not None:
            login = refresh.registration if refresh else "251000000"
            set_access_cookie(response, access, login)
        if refresh is not None:
            set_refresh_cookie(response, refresh)
        return {nome: morsel.value for nome, morsel in _carregar(response).items()}

    return _build


def _carregar(response) -> SimpleCookie:
    headers = response.headers
    # `Response` do Starlette expõe `getlist`; o do httpx, `get_list`.
    brutos = (
        headers.get_list("set-cookie")
        if hasattr(headers, "get_list")
        else headers.getlist("set-cookie")
    )

    jar = SimpleCookie()
    for header in brutos:
        jar.load(header)
    return jar


@pytest.fixture
def ler_cookies():
    """Lê os `Set-Cookie` de uma resposta como um jar, com atributos e tudo."""
    return _carregar
