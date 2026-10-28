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
    assert 'data-url="/api/openapi.json"' in response.text


def test_rotas_respondem_com_e_sem_prefixo_api(client):
    for path in ("/openapi.json", "/api/openapi.json", "/api/docs"):
        assert client.get(path).status_code == 200
    assert client.get("/api/openapi.json").json()["servers"] == [{"url": "/api"}]


def test_openapi_agrupa_recursos_publicos_sem_ocultar_rotas_privadas(client):
    schema = client.get("/openapi.json").json()
    groups = {group["name"]: group["tags"] for group in schema["x-tagGroups"]}
    assert groups["Public"] == [
        "Public Classrooms",
        "Public Courses",
        "Public Professors",
        "Public Restaurant",
        "Public Subjects",
    ]
    tags = {tag["name"]: tag for tag in schema["tags"]}
    assert "/public/professors" in schema["paths"]
    assert "/public/professors/{siape}" in schema["paths"]
    assert "/professors" not in schema["paths"]
    assert tags["Public Classrooms"]["x-displayName"] == "Classrooms"
    assert tags["Public Courses"]["x-displayName"] == "Courses"
    assert tags["Public Professors"]["x-displayName"] == "Professors"
    assert tags["Public Restaurant"]["x-displayName"] == "Restaurant"
    assert tags["Public Subjects"]["x-displayName"] == "Subjects"
    grouped_tags = {tag for group in groups.values() for tag in group}
    for path, methods in schema["paths"].items():
        for operation in methods.values():
            assert set(operation["tags"]) <= grouped_tags
            assert bool(set(operation["tags"]) & set(groups["Public"])) == (
                path.startswith("/public/")
            )


def test_cors_libera_origens_configuradas_com_credenciais(client):
    for origin in ("https://followw.app",):
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


def test_openapi_contem_documentacao_markdown(client):
    schema = client.get("/openapi.json").json()
    description = schema["info"]["description"]
    assert "Documento de Arquitetura" in description
    assert "Segurança das credenciais do SIGAA" in description
    assert "Cache e Sincronização" in description
