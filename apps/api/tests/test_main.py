import importlib
import logging

from fastapi.middleware.httpsredirect import HTTPSRedirectMiddleware

import api.main as main_module
from api.core.config import settings
from api.main import app  # noqa: F401  garante que o módulo foi importado


def test_httpx_logs_silenciados():
    assert logging.getLogger("httpx").level == logging.WARNING
    assert logging.getLogger("httpcore").level == logging.WARNING


def test_redireciona_https_em_producao(monkeypatch):
    original = settings.environment
    monkeypatch.setattr(settings, "environment", "production")
    importlib.reload(main_module)
    try:
        assert any(
            m.cls is HTTPSRedirectMiddleware for m in main_module.app.user_middleware
        )
    finally:
        monkeypatch.setattr(settings, "environment", original)
        importlib.reload(main_module)


def test_scalar_docs_retorna_html_com_referencia_openapi(client):
    response = client.get("/docs")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "api-reference" in response.text
    assert "/openapi.json" in response.text


def test_cors_libera_origem_do_front_com_credenciais(client):
    response = client.options(
        "/me",
        headers={
            "Origin": "https://followw.app",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://followw.app"
    assert response.headers["access-control-allow-credentials"] == "true"


def test_cors_nao_libera_origem_desconhecida(client):
    response = client.get("/docs", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in response.headers
