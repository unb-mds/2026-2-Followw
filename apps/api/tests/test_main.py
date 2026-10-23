import importlib
import logging

import uvicorn
from fastapi.middleware.httpsredirect import HTTPSRedirectMiddleware
from fastapi.testclient import TestClient

import api.main as main_module
from api.__init__ import main as run_server
from api.core.config import settings
from api.main import app


def test_httpx_logs_silenciados():
    assert logging.getLogger("httpx").level == logging.WARNING
    assert logging.getLogger("httpcore").level == logging.WARNING


def test_servidor_configura_prefixo_e_observa_apenas_codigo_python(monkeypatch):
    options = {}
    monkeypatch.setattr(uvicorn, "run", lambda *args, **kwargs: options.update(kwargs))

    run_server()

    assert options["root_path"] == "/api"
    assert options["reload"] is True
    assert len(options["reload_dirs"]) == 3
    assert all(path.is_dir() for path in options["reload_dirs"])
    assert all(".venv" not in path.parts for path in options["reload_dirs"])


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


def test_rotas_respondem_com_e_sem_prefixo_api():
    with TestClient(app) as client:
        assert client.get("/openapi.json").status_code == 200
        assert client.get("/api/docs").status_code == 200
        response = client.get("/api/openapi.json")
        assert response.status_code == 200
        assert response.json()["servers"] == [{"url": "/api"}]


def test_openapi_agrupa_recursos_publicos_sem_ocultar_rotas_privadas(client):
    schema = client.get("/openapi.json").json()
    groups = {group["name"]: group["tags"] for group in schema["x-tagGroups"]}
    assert groups["Public"] == [
        "Public Classrooms",
        "Public Courses",
        "Public Restaurant",
        "Public Subjects",
    ]
    tags = {tag["name"]: tag for tag in schema["tags"]}
    assert tags["Public Classrooms"]["x-displayName"] == "Classrooms"
    assert tags["Public Courses"]["x-displayName"] == "Courses"
    assert tags["Public Restaurant"]["x-displayName"] == "Restaurant"
    assert tags["Public Subjects"]["x-displayName"] == "Subjects"
    grouped_tags = {tag for group in groups.values() for tag in group}
    for path, methods in schema["paths"].items():
        for operation in methods.values():
            assert set(operation["tags"]) <= grouped_tags
            assert bool(
                set(operation["tags"]) & set(groups["Public"])
            ) == path.startswith("/public/")


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
