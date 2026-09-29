import importlib
import logging

from fastapi.middleware.cors import CORSMiddleware
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
        cors = next(
            m for m in main_module.app.user_middleware if m.cls is CORSMiddleware
        )
        assert "http://localhost:3000" not in cors.kwargs["allow_origins"]
    finally:
        monkeypatch.setattr(settings, "environment", original)
        importlib.reload(main_module)


def test_scalar_docs_retorna_html_com_referencia_openapi(client):
    response = client.get("/docs")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "api-reference" in response.text
    assert "/openapi.json" in response.text


def test_openapi_agrupa_recursos_publicos_sem_ocultar_rotas_privadas(client):
    schema = client.get("/openapi.json").json()
    groups = {group["name"]: group["tags"] for group in schema["x-tagGroups"]}
    assert groups["Public"] == ["Public Classrooms", "Public Restaurant"]
    tags = {tag["name"]: tag for tag in schema["tags"]}
    assert tags["Public Classrooms"]["x-displayName"] == "Classrooms"
    assert tags["Public Restaurant"]["x-displayName"] == "Restaurant"
    grouped_tags = {tag for group in groups.values() for tag in group}
    for path, methods in schema["paths"].items():
        for operation in methods.values():
            assert set(operation["tags"]) <= grouped_tags
            assert bool(
                set(operation["tags"]) & set(groups["Public"])
            ) == path.startswith("/public/")


def test_cors_libera_origens_do_front_com_credenciais(client):
    for origin in ("https://followw.app", "http://localhost:3000"):
        response = client.options(
            "/me",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "GET",
            },
        )
        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == origin
        assert response.headers["access-control-allow-credentials"] == "true"


def test_cors_nao_libera_origem_desconhecida(client):
    response = client.get("/docs", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in response.headers
