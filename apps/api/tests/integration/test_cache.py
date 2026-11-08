import pytest


@pytest.mark.parametrize(
    "path",
    [
        "/posts",
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
        "/classrooms/{classroom_id}/posts",
        "/classrooms/{classroom_id}/posts/{post_id}",
        "/public/restaurant",
    ],
)
def test_rotas_com_cache_documentam_o_header(client, path):
    route = client.get("/openapi.json").json()["paths"][path]["get"]
    parametros = {p["name"]: p for p in route["parameters"]}

    assert parametros["Cache-Control"]["in"] == "header"
    assert "refresh" not in parametros
