from datetime import UTC, date, datetime, timedelta
from unittest.mock import AsyncMock

import httpx
import pytest
from pydantic import SecretStr
from sigaa_client import (
    AuthenticationFailed,
    Classroom,
    ClassroomNotFound,
    Credentials,
    News,
    NewsAttachment,
    NewsNotFound,
    SessionExpired,
    SigaaParseError,
    Subject,
)
from sqlalchemy import select

from api.db.main import get_sessionmaker
from api.db.models import Classroom as DBClassroom
from api.db.models import ClassroomNews
from api.services.sync import Job, Task

CREDENTIALS = Credentials(registration="251000000", password=SecretStr("senha123"))
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
    stub_sigaa.classrooms.list_current_classrooms = AsyncMock(
        return_value=[
            Classroom(
                id="AAA",
                sigaa_id=123,
                number="01",
                current=True,
                semester="2026.2",
                subject=Subject(name="ESTRUTURAS DE DADOS 1"),
            )
        ]
    )
    stub_sigaa.classrooms.list_classrooms.return_value = (
        stub_sigaa.classrooms.list_current_classrooms.return_value
    )
    return stub_sigaa


def _fetch(stub, path):
    if path in DETAIL_PATHS:
        return stub.classrooms.get_classroom_news
    return (
        stub.profile.list_news
        if path == "/news"
        else stub.classrooms.list_classroom_news
    )


def test_feed_geral_sempre_consulta_sigaa_sem_banco_ou_fila(
    client, cookies, news_sigaa, qstash
):
    def banco_proibido():
        pytest.fail("O feed geral não deve abrir o banco")

    client.app.dependency_overrides[get_sessionmaker] = banco_proibido
    client.cookies.update(cookies(refresh=CREDENTIALS))
    fetch = news_sigaa.profile.list_news
    first = client.get("/news")
    assert first.status_code == 200
    assert first.json() == [n.model_dump(mode="json") for n in fetch.return_value]
    assert first.headers["cache-control"] == "no-store"
    fetch.return_value = []
    second = client.get("/news")
    assert second.status_code == 200
    assert second.json() == []
    assert fetch.await_count == 2
    assert news_sigaa.aclose.await_count == 2
    assert qstash.published == []


@pytest.mark.parametrize("path", PATHS)
def test_noticias_exigem_autenticacao(client, news_sigaa, path):
    assert client.get(path).status_code == 401
    news_sigaa.created.assert_not_called()


@pytest.mark.parametrize("path", PATHS[1:])
def test_noticias_recusam_turma_fora_do_historico(client, cookies, news_sigaa, path):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    _fetch(news_sigaa, path).side_effect = ClassroomNotFound()

    response = client.get(path)
    assert response.status_code == 404
    assert response.json() == {"detail": "Classroom not found"}


def test_noticias_de_turma_do_historico(client, cookies, news_sigaa):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    historical = news_sigaa.classrooms.list_classrooms.return_value[0].model_copy(
        update={"id": "BBB", "sigaa_id": None, "current": False}
    )
    news_sigaa.classrooms.list_classrooms.return_value = [historical]
    response = client.get("/classrooms/BBB/news")
    assert response.status_code == 200
    assert response.json()[0]["classroom_sigaa_id"] is None
    news_sigaa.classrooms.list_classroom_news.assert_awaited_once_with("BBB")
    news_sigaa.classrooms.list_current_classrooms.assert_not_awaited()


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

    assert client.get(path, headers={"Cache-Control": "no-cache"}).status_code == code


def test_openapi_documenta_cache_apenas_nas_noticias_de_turma(client):
    paths = client.get("/openapi.json").json()["paths"]
    for path in ("/news", "/classrooms/{classroom_id}/news"):
        route = paths[path]["get"]
        assert {"401", "502"} <= route["responses"].keys()
        assert any(
            p["name"] == "Cache-Control" for p in route.get("parameters", [])
        ) == (path != "/news")
        schema = route["responses"]["200"]["content"]["application/json"]["schema"]
        assert schema["items"]["$ref"] == "#/components/schemas/News"
    assert "404" in paths["/classrooms/{classroom_id}/news"]["get"]["responses"]
    detail = paths["/classrooms/{classroom_id}/news/{news_id}"]["get"]
    assert {"401", "404", "422", "502"} <= detail["responses"].keys()
    assert (
        detail["responses"]["200"]["content"]["application/json"]["schema"]["$ref"]
        == "#/components/schemas/News"
    )


def test_feed_resolve_ids_uma_vez_por_turma_e_permite_abrir_detalhe(
    client, cookies, news_sigaa
):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    home = news_sigaa.profile.list_news.return_value[0]
    news_sigaa.profile.list_news.return_value = [
        home,
        home.model_copy(update={"title": "Outro &#127916;"}),
    ]
    news_sigaa.classrooms.list_classroom_news.return_value.append(
        home.model_copy(update={"id": 2, "title": "Outro 🎬"})
    )
    response = client.get("/news?resolve_ids=true")
    assert response.status_code == 200
    assert [n["id"] for n in response.json()] == [1, 2]
    news_sigaa.classrooms.list_current_classrooms.assert_awaited_once()
    news_sigaa.classrooms.list_classroom_news.assert_awaited_once_with("AAA")
    news_sigaa.classrooms.get_classroom_news.assert_not_awaited()

    item = response.json()[0]
    detail = client.get(f"/classrooms/{item['classroom_sigaa_id']}/news/{item['id']}")
    assert detail.status_code == 200
    assert detail.json()["content"] == "Leia o **material** antes da aula."
    news_sigaa.classrooms.list_classroom_news.assert_awaited_once()


@pytest.mark.parametrize("case", ["titulo", "data", "duplicado", "turma"])
def test_feed_nao_inventa_id_quando_associacao_nao_e_inequivoca(
    client, cookies, news_sigaa, case
):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    item = news_sigaa.classrooms.list_classroom_news.return_value[0]
    if case == "titulo":
        news_sigaa.classrooms.list_classroom_news.return_value = [
            item.model_copy(update={"title": "Outra notícia"})
        ]
    elif case == "data":
        news_sigaa.classrooms.list_classroom_news.return_value = [
            item.model_copy(update={"published_on": date(2026, 9, 23)})
        ]
    elif case == "duplicado":
        news_sigaa.classrooms.list_classroom_news.return_value.append(
            item.model_copy(update={"id": 2})
        )
    else:
        news_sigaa.classrooms.list_current_classrooms.return_value = []
    response = client.get("/news?resolve_ids=true")
    assert response.status_code == 200
    assert response.json()[0]["id"] is None


def test_feed_padrao_e_feed_vazio_nao_consultam_turmas(client, cookies, news_sigaa):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    assert client.get("/news").status_code == 200
    news_sigaa.profile.list_news.return_value = []
    assert client.get("/news?resolve_ids=true").json() == []
    news_sigaa.classrooms.list_current_classrooms.assert_not_awaited()
    news_sigaa.classrooms.list_classroom_news.assert_not_awaited()


def test_feed_enriquecido_tambem_reconsulta_sigaa(client, cookies, news_sigaa):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    assert client.get("/news?resolve_ids=true").json()[0]["id"] == 1
    news_sigaa.classrooms.list_classroom_news.return_value = []
    assert client.get("/news?resolve_ids=true").json()[0]["id"] is None
    assert news_sigaa.classrooms.list_classroom_news.await_count == 2


@pytest.mark.parametrize("path", PATHS[1:])
def test_cache_de_turma_evita_nova_consulta(client, cookies, news_sigaa, qstash, path):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    first = client.get(path)
    assert first.status_code == 200
    assert first.headers["cache-control"] == "private, no-cache"
    news_sigaa.created.reset_mock()
    second = client.get(path)
    assert second.json() == first.json()
    assert "age" in second.headers
    _fetch(news_sigaa, path).assert_awaited_once()
    news_sigaa.created.assert_not_called()
    assert qstash.published == []


def test_lista_vazia_tambem_tem_cache(client, cookies, news_sigaa):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    news_sigaa.classrooms.list_classroom_news.return_value = []
    assert client.get("/classrooms/AAA/news").json() == []
    assert client.get("/classrooms/AAA/news").json() == []
    news_sigaa.classrooms.list_classroom_news.assert_awaited_once()


def test_lista_vencida_retorna_cache_e_atualiza_pela_fila(
    client, cookies, news_sigaa, database, qstash
):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    original = client.get("/classrooms/AAA/news").json()
    with database() as session:
        classroom = session.scalar(select(DBClassroom))
        classroom.news_synced_at = datetime.now(UTC) - timedelta(minutes=61)
        session.commit()
    news_sigaa.classrooms.list_classroom_news.return_value = [
        News(id=2, title="Novo aviso", published_on=date(2026, 9, 25))
    ]
    response = client.get("/classrooms/AAA/news")
    assert response.json() == original
    assert int(response.headers["age"]) >= 3600
    assert len(qstash.published) == 1
    assert qstash.deliveries[0].status_code == 204
    # O novo aviso foi acrescentado; o antigo não foi apagado.
    assert [n["id"] for n in client.get("/classrooms/123/news").json()] == [2, 1]
    assert news_sigaa.classrooms.list_classroom_news.await_count == 2


def test_lista_de_turma_do_historico_nao_vence(
    client, cookies, news_sigaa, database, qstash
):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    historical = news_sigaa.classrooms.list_classrooms.return_value[0].model_copy(
        update={"id": "BBB", "sigaa_id": None, "current": False}
    )
    news_sigaa.classrooms.list_classrooms.return_value = [historical]
    original = client.get("/classrooms/BBB/news").json()
    with database() as session:
        classroom = session.scalar(select(DBClassroom))
        classroom.news_synced_at = datetime.now(UTC) - timedelta(days=365)
        session.commit()
    assert client.get("/classrooms/BBB/news").json() == original
    assert qstash.published == []
    news_sigaa.classrooms.list_classroom_news.assert_awaited_once()


@pytest.mark.parametrize("remaining", [True, False])
def test_atualizar_lista_preserva_conteudo_e_noticias_removidas(
    client, cookies, news_sigaa, database, remaining
):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    detail = client.get(DETAIL_PATH).json()
    assert client.get("/classrooms/AAA/news").status_code == 200
    if not remaining:
        news_sigaa.classrooms.list_classroom_news.return_value = []
    response = client.get("/classrooms/AAA/news", headers={"Cache-Control": "no-cache"})
    assert [n["id"] for n in response.json()] == [1]
    assert response.json()[0]["content"] is None
    assert client.get(DETAIL_PATH).json() == detail
    news_sigaa.classrooms.get_classroom_news.assert_awaited_once()
    with database() as session:
        assert len(list(session.scalars(select(ClassroomNews)))) == 1


@pytest.mark.parametrize("content", [None, "", "Texto"])
def test_conteudo_nao_expira_inclusive_quando_vazio(
    client, cookies, news_sigaa, database, qstash, content
):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    fetch = news_sigaa.classrooms.get_classroom_news
    fetch.return_value = fetch.return_value.model_copy(update={"content": content})
    assert client.get(DETAIL_PATH).status_code == 200
    with database() as session:
        item = session.scalar(select(ClassroomNews))
        item.content_synced_at = datetime.now(UTC) - timedelta(days=365)
        session.commit()
    fetch.side_effect = NewsNotFound()
    response = client.get(DETAIL_PATH)
    assert response.status_code == 200
    assert response.json()["content"] == content
    assert fetch.await_count == 1
    assert qstash.published == []


def test_no_cache_atualiza_conteudo_quando_solicitado(client, cookies, news_sigaa):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    assert client.get(DETAIL_PATH).status_code == 200
    fetch = news_sigaa.classrooms.get_classroom_news
    fetch.return_value = fetch.return_value.model_copy(update={"content": "Atualizado"})
    response = client.get(DETAIL_PATH, headers={"Cache-Control": "no-cache"})
    assert response.json()["content"] == "Atualizado"
    assert fetch.await_count == 2


def test_cache_nao_da_acesso_a_usuario_sem_vinculo(client, cookies, news_sigaa):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    assert client.get(DETAIL_PATH).status_code == 200
    other = Credentials(registration="251000001", password=SecretStr("senha"))
    client.cookies.clear()
    client.cookies.update(cookies(refresh=other))
    news_sigaa.profile.get_profile.return_value = (
        news_sigaa.profile.get_profile.return_value.model_copy(
            update={"registration": other.registration}
        )
    )
    news_sigaa.classrooms.list_classrooms.return_value = []
    assert client.get(DETAIL_PATH).status_code == 404
    news_sigaa.classrooms.get_classroom_news.assert_awaited_once()


def test_only_if_cached_nao_busca_noticia_ausente(client, cookies, news_sigaa):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    assert client.get("/classrooms").status_code == 200
    for path in ("/classrooms/AAA/news", DETAIL_PATH):
        assert (
            client.get(path, headers={"Cache-Control": "only-if-cached"}).status_code
            == 504
        )
    news_sigaa.classrooms.list_classroom_news.assert_not_awaited()
    news_sigaa.classrooms.get_classroom_news.assert_not_awaited()


@pytest.mark.parametrize("path", ["/classrooms/AAA/news", DETAIL_PATH])
def test_stale_if_error_preserva_resposta_em_falha_do_sigaa(
    client, cookies, news_sigaa, path
):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    original = client.get(path).json()
    _fetch(news_sigaa, path).side_effect = SigaaParseError("indisponível")
    response = client.get(path, headers={"Cache-Control": "no-cache, stale-if-error"})
    assert response.status_code == 200
    assert response.json() == original


def test_jobs_de_conteudos_distintos_nao_sao_deduplicados():
    job = Job(
        task=Task.NEWS_CONTENT,
        registration="251000000",
        session_token="token",
        classroom_id="AAA",
        item_id=1,
    )
    assert job.key != job.model_copy(update={"item_id": 2}).key


def test_lista_nao_busca_conteudo_ate_primeira_abertura(client, cookies, news_sigaa):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    assert client.get("/classrooms/AAA/news").status_code == 200
    news_sigaa.classrooms.get_classroom_news.assert_not_awaited()
    first = client.get(DETAIL_PATH)
    assert first.status_code == 200
    assert first.json()["content"] is not None
    assert client.get(DETAIL_PATH).json() == first.json()
    news_sigaa.classrooms.get_classroom_news.assert_awaited_once()


def test_ttl_do_conteudo_pode_ser_ativado(
    client, cookies, news_sigaa, database, monkeypatch, qstash
):
    monkeypatch.setattr("api.services.news.NEWS_CONTENT_TTL", timedelta(minutes=60))
    client.cookies.update(cookies(refresh=CREDENTIALS))
    original = client.get(DETAIL_PATH).json()
    with database() as session:
        item = session.scalar(select(ClassroomNews))
        item.content_synced_at = datetime.now(UTC) - timedelta(minutes=61)
        session.commit()
    fetch = news_sigaa.classrooms.get_classroom_news
    fetch.return_value = fetch.return_value.model_copy(update={"content": "Novo texto"})
    assert client.get(DETAIL_PATH).json() == original
    assert len(qstash.published) == 1
    assert qstash.deliveries[0].status_code == 204
    assert client.get(DETAIL_PATH).json()["content"] == "Novo texto"
    assert fetch.await_count == 2


def test_mesmo_id_de_noticia_em_turmas_distintas_nao_mistura_conteudo(
    client, cookies, news_sigaa
):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    classrooms = news_sigaa.classrooms.list_classrooms.return_value
    classrooms.append(
        classrooms[0].model_copy(update={"id": "BBB", "number": "02", "sigaa_id": 456})
    )
    original = client.get(DETAIL_PATH).json()
    fetch = news_sigaa.classrooms.get_classroom_news
    fetch.return_value = fetch.return_value.model_copy(
        update={"content": "Outra turma"}
    )
    second = client.get("/classrooms/BBB/news/1")
    assert second.status_code == 200
    assert second.json()["content"] == "Outra turma"
    assert second.json()["classroom_sigaa_id"] == 456
    assert client.get(DETAIL_PATH).json() == original
