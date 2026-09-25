from datetime import date, datetime
from unittest.mock import AsyncMock

import httpx
import pytest
from pydantic import SecretStr
from sigaa_client import (
    AuthenticationFailed,
    Classroom,
    Credentials,
    News,
    NewsAttachment,
    NewsNotFound,
    SessionExpired,
    SigaaParseError,
    Subject,
)

from api.db.main import get_sessionmaker

CREDENTIALS = Credentials(registration="251000000", password=SecretStr("senha"))
DETAIL_PATH = "/classrooms/AAA/news/1"
DETAIL_PATHS = [DETAIL_PATH, "/classrooms/123/news/1"]
PATHS = ["/news", "/classrooms/AAA/news", "/classrooms/123/news", *DETAIL_PATHS]


@pytest.fixture
def news_sigaa(stub_sigaa):
    stub_sigaa.profile.list_news = AsyncMock(
        return_value=[
            News(title="Aviso", published_on=date(2026, 9, 24), classroom_sigaa_id=123)
        ]
    )
    stub_sigaa.classrooms.list_classroom_news = AsyncMock(
        return_value=[News(id=1, title="Aviso", published_on=date(2026, 9, 24))]
    )
    stub_sigaa.classrooms.get_classroom_news = AsyncMock(
        return_value=News(
            id=1,
            title="Aviso",
            published_on=date(2026, 9, 24),
            published_at=datetime.fromisoformat("2026-09-24T10:30:00"),
            content="Leia o **material** antes da aula.",
            attachments=(
                NewsAttachment(
                    name="Material.pdf", url="https://sigaa.unb.br/material.pdf"
                ),
            ),
        )
    )
    stub_sigaa.classrooms.list_classrooms.return_value = [
        Classroom(
            id="AAA",
            sigaa_id=123,
            number="01",
            semester="2026.2",
            subject=Subject(code="FGA0146", name="ESTRUTURAS DE DADOS 1"),
        )
    ]
    return stub_sigaa


def _fetch(stub, path):
    if path in DETAIL_PATHS:
        return stub.classrooms.get_classroom_news
    return (
        stub.profile.list_news
        if path == "/news"
        else stub.classrooms.list_classroom_news
    )


@pytest.mark.parametrize("path", PATHS)
def test_noticias_sempre_consultam_sigaa_sem_banco_ou_fila(
    client, cookies, news_sigaa, qstash, path
):
    def banco_proibido():
        pytest.fail("Notícias não devem abrir o banco")

    client.app.dependency_overrides[get_sessionmaker] = banco_proibido
    client.cookies.update(cookies(refresh=CREDENTIALS))
    fetch = _fetch(news_sigaa, path)
    expected = (
        fetch.return_value.model_dump(mode="json")
        if path in DETAIL_PATHS
        else [n.model_dump(mode="json") for n in fetch.return_value]
    )
    if path != "/news":
        for item in ([expected] if path in DETAIL_PATHS else expected):
            item["classroom_sigaa_id"] = 123

    first = client.get(path)
    assert first.status_code == 200
    assert first.json() == expected
    assert first.headers["cache-control"] == "no-store"
    fetch.return_value = (
        fetch.return_value.model_copy(
            update={"content": "Texto atualizado", "attachments": ()}
        )
        if path in DETAIL_PATHS
        else []
    )
    second = client.get(path)
    assert second.status_code == 200
    if path in DETAIL_PATHS:
        assert second.json()["content"] == "Texto atualizado"
        assert second.json()["attachments"] == []
    else:
        assert second.json() == []
    assert fetch.await_count == 2
    assert news_sigaa.aclose.await_count == 2
    assert qstash.published == []
    if path != "/news":
        assert news_sigaa.classrooms.list_classrooms.await_count == 2
        fetch.assert_awaited_with(*(("AAA", 1) if path in DETAIL_PATHS else ("AAA",)))
        if path in DETAIL_PATHS:
            news_sigaa.classrooms.list_classroom_news.assert_not_awaited()


@pytest.mark.parametrize("path", PATHS)
def test_noticias_exigem_autenticacao(client, news_sigaa, path):
    assert client.get(path).status_code == 401
    news_sigaa.created.assert_not_called()


@pytest.mark.parametrize("path", PATHS[1:])
def test_noticias_recusam_turma_que_saiu_da_lista(client, cookies, news_sigaa, path):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    assert client.get(path).status_code == 200
    news_sigaa.classrooms.list_classrooms.return_value = []

    assert client.get(path).status_code == 404
    if path in DETAIL_PATHS:
        news_sigaa.classrooms.get_classroom_news.assert_awaited_once_with("AAA", 1)
    else:
        news_sigaa.classrooms.list_classroom_news.assert_awaited_once_with("AAA")


def test_detalhe_recusa_noticia_ausente_na_turma(client, cookies, news_sigaa):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    news_sigaa.classrooms.get_classroom_news.side_effect = NewsNotFound()
    response = client.get("/classrooms/AAA/news/2")
    assert response.status_code == 404
    assert response.json() == {"detail": "News not found"}
    news_sigaa.classrooms.get_classroom_news.assert_awaited_once_with("AAA", 2)


@pytest.mark.parametrize("news_id", ["abc", "0", "-1"])
def test_detalhe_exige_id_inteiro_positivo(client, cookies, news_sigaa, news_id):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    assert client.get(f"/classrooms/AAA/news/{news_id}").status_code == 422
    news_sigaa.classrooms.get_classroom_news.assert_not_awaited()


@pytest.mark.parametrize("path", PATHS)
@pytest.mark.parametrize(
    "error,code",
    [
        (AuthenticationFailed(), 401),
        (SessionExpired(), 401),
        (SigaaParseError("layout mudou"), 502),
        (httpx.ReadTimeout("SIGAA indisponível"), 502),
    ],
)
def test_erro_do_sigaa_em_noticias_nao_retorna_dados_antigos(
    client, cookies, news_sigaa, path, error, code
):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    assert client.get(path).status_code == 200
    _fetch(news_sigaa, path).side_effect = error

    assert client.get(path).status_code == code


def test_openapi_documenta_noticias_sem_parametro_de_cache(client):
    paths = client.get("/openapi.json").json()["paths"]
    for path in ("/news", "/classrooms/{classroom_id}/news"):
        route = paths[path]["get"]
        assert {"401", "502"} <= route["responses"].keys()
        assert not any(p["name"] == "refresh" for p in route.get("parameters", []))
        schema = route["responses"]["200"]["content"]["application/json"]["schema"]
        assert schema["items"]["$ref"] == "#/components/schemas/News"
    assert "404" in paths["/classrooms/{classroom_id}/news"]["get"]["responses"]
    detail = paths["/classrooms/{classroom_id}/news/{news_id}"]["get"]
    assert {"401", "404", "422", "502"} <= detail["responses"].keys()
    assert (
        detail["responses"]["200"]["content"]["application/json"]["schema"]["$ref"]
        == "#/components/schemas/News"
    )


def test_feed_resolve_ids_uma_vez_por_turma_e_permite_abrir_detalhe(client, cookies, news_sigaa):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    home = news_sigaa.profile.list_news.return_value[0]
    news_sigaa.profile.list_news.return_value = [home, home.model_copy(update={"title": "Outro &#127916;"})]
    news_sigaa.classrooms.list_classroom_news.return_value.append(
        home.model_copy(update={"id": 2, "title": "Outro 🎬"})
    )
    response = client.get("/news?resolve_ids=true")
    assert response.status_code == 200
    assert [n["id"] for n in response.json()] == [1, 2]
    news_sigaa.classrooms.list_classrooms.assert_awaited_once()
    news_sigaa.classrooms.list_classroom_news.assert_awaited_once_with("AAA")
    news_sigaa.classrooms.get_classroom_news.assert_not_awaited()

    item = response.json()[0]
    detail = client.get(f"/classrooms/{item['classroom_sigaa_id']}/news/{item['id']}")
    assert detail.status_code == 200
    assert detail.json()["content"] == "Leia o **material** antes da aula."
    news_sigaa.classrooms.list_classroom_news.assert_awaited_once()


@pytest.mark.parametrize("case", ["titulo", "data", "duplicado", "turma"])
def test_feed_nao_inventa_id_quando_associacao_nao_e_inequivoca(client, cookies, news_sigaa, case):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    item = news_sigaa.classrooms.list_classroom_news.return_value[0]
    if case == "titulo":
        news_sigaa.classrooms.list_classroom_news.return_value = [item.model_copy(update={"title": "Outra notícia"})]
    elif case == "data":
        news_sigaa.classrooms.list_classroom_news.return_value = [item.model_copy(update={"published_on": date(2026, 9, 23)})]
    elif case == "duplicado":
        news_sigaa.classrooms.list_classroom_news.return_value.append(item.model_copy(update={"id": 2}))
    else:
        news_sigaa.classrooms.list_classrooms.return_value = []
    response = client.get("/news?resolve_ids=true")
    assert response.status_code == 200
    assert response.json()[0]["id"] is None


def test_feed_padrao_e_feed_vazio_nao_consultam_turmas(client, cookies, news_sigaa):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    assert client.get("/news").status_code == 200
    news_sigaa.profile.list_news.return_value = []
    assert client.get("/news?resolve_ids=true").json() == []
    news_sigaa.classrooms.list_classrooms.assert_not_awaited()
    news_sigaa.classrooms.list_classroom_news.assert_not_awaited()


def test_feed_enriquecido_tambem_reconsulta_sigaa(client, cookies, news_sigaa):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    assert client.get("/news?resolve_ids=true").json()[0]["id"] == 1
    news_sigaa.classrooms.list_classroom_news.return_value = []
    assert client.get("/news?resolve_ids=true").json()[0]["id"] is None
    assert news_sigaa.classrooms.list_classroom_news.await_count == 2
