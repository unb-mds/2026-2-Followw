from datetime import UTC, date, datetime, timedelta
from unittest.mock import AsyncMock

import httpx
import pytest
from pydantic import SecretStr
from sigaa_client import (
    AuthenticationFailed,
    Classroom,
    ClassroomNotFound,
    ClassroomPost,
    Credentials,
    DashboardPost,
    News,
    NewsAttachment,
    NewsNotFound,
    PostType,
    SessionExpired,
    SigaaParseError,
    Subject,
)
from sqlalchemy import select

from api.db.main import get_sessionmaker
from api.db.models import Classroom as DBClassroom
from api.db.models import ClassroomPosts
from api.modules.classrooms.posts import sync_news_content
from api.sync.engine import Job, Step

CREDENTIALS = Credentials(registration="251000000", password=SecretStr("senha123"))
DETAIL_PATH = "/classrooms/AAA/posts/news:1"
DETAIL_PATHS = [DETAIL_PATH, "/classrooms/123/posts/news:1"]
PATHS = ["/posts", "/classrooms/AAA/posts", "/classrooms/123/posts", *DETAIL_PATHS]


def test_feed_sem_turmas_nao_agenda_jobs(client, cookies, posts_sigaa, qstash):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    posts_sigaa.classrooms.list_classrooms.return_value = []
    client.get("/classrooms")
    qstash.published.clear()
    response = client.get("/posts/news")
    assert response.json() == {"items": [], "updating": False}
    assert qstash.published == []


def test_feed_nao_busca_conteudo_das_noticias(client, cookies, posts_sigaa, qstash):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    client.get("/classrooms/AAA/posts")
    qstash.published.clear()
    response = client.get("/posts/news")
    assert response.json()["updating"] is False
    assert response.json()["items"][0]["post"]["content"] is None
    posts_sigaa.classrooms.get_classroom_news.assert_not_awaited()
    assert qstash.published == []


def test_noticias_agregadas_retornam_ate_cinco_com_ids_e_conteudo_salvo(
    client, cookies, posts_sigaa
):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    posts_sigaa.classrooms.list_classroom_posts.return_value = [
        ClassroomPost.from_news(
            News(id=i, title="Aviso", published_on=date(2026, 9, i))
        )
        for i in range(1, 8)
    ]
    client.get("/classrooms/AAA/posts")
    posts_sigaa.classrooms.get_classroom_news.return_value = News(
        id=7, title="Aviso", published_on=date(2026, 9, 7), content="Texto salvo"
    )
    client.get("/classrooms/AAA/posts/news:7")
    response = client.get("/posts/news")
    assert response.status_code == 200
    items = response.json()["items"]
    assert [item["post"]["id"] for item in items] == [
        f"news:{i}" for i in range(7, 2, -1)
    ]
    assert items[0]["post"]["content"] == "Texto salvo"
    assert all(item["classroom"]["id"] == "AAA" for item in items)


def test_noticias_agregadas_preservam_mesmo_titulo_dia_e_id_em_turmas_distintas(
    client, cookies, posts_sigaa
):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    original = posts_sigaa.classrooms.list_classrooms.return_value[0]
    posts_sigaa.classrooms.list_classrooms.return_value = [
        original,
        original.model_copy(update={"id": "BBB", "sigaa_id": 124, "number": "02"}),
    ]
    client.get("/classrooms/AAA/posts")
    client.get("/classrooms/BBB/posts")
    items = client.get("/posts/news").json()["items"]
    assert len(items) == 2
    assert {item["classroom"]["id"] for item in items} == {"AAA", "BBB"}
    assert [item["post"]["id"] for item in items] == ["news:1", "news:1"]


def test_feed_frio_agenda_a_lista_e_devolve_cache_sem_esperar_a_turma(
    client, cookies, posts_sigaa, qstash
):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    client.get("/classrooms")
    posts_sigaa.created.reset_mock()
    response = client.get("/posts/news")
    assert response.json() == {"items": [], "updating": True}
    posts_sigaa.classrooms.list_classroom_posts.assert_awaited_once()
    assert len(qstash.published) == 1
    assert [step.task for step in qstash.jobs()[0].steps] == ["sync_posts"]
    assert client.get("/posts/news").json()["items"][0]["post"]["id"] == "news:1"


def test_feed_devolve_noticias_disponiveis_enquanto_outra_turma_nao_tem_cache(
    client, cookies, posts_sigaa
):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    original = posts_sigaa.classrooms.list_classrooms.return_value[0]
    posts_sigaa.classrooms.list_classrooms.return_value = [
        original,
        original.model_copy(update={"id": "BBB", "sigaa_id": 124, "number": "02"}),
    ]
    client.get("/classrooms/AAA/posts")
    response = client.get("/posts/news")
    assert response.status_code == 200
    assert response.json()["updating"] is True
    assert [item["classroom"]["id"] for item in response.json()["items"]] == ["AAA"]


@pytest.fixture
def posts_sigaa(stub_sigaa):
    stub_sigaa.classrooms.list_dashboard_posts = AsyncMock(
        return_value=[
            DashboardPost(
                type=PostType.NEWS,
                classroom_sigaa_id=123,
                title="Aviso",
                published_on=date(2026, 9, 24),
            ),
            DashboardPost(
                type=PostType.ASSESSMENT,
                classroom_sigaa_id=123,
                title="Avaliação A2",
                starts_on=date(2026, 10, 29),
            ),
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
            current=True,
            semester="2026.2",
            subject=Subject(code="FGA0146", name="ESTRUTURAS DE DADOS 1"),
        )
    ]
    stub_sigaa.classrooms.list_classroom_posts = AsyncMock(
        return_value=[
            ClassroomPost.from_news(n)
            for n in stub_sigaa.classrooms.list_classroom_news.return_value
        ]
    )
    return stub_sigaa


def _fetch(stub, path):
    if path in DETAIL_PATHS:
        return stub.classrooms.get_classroom_news
    return (
        stub.classrooms.list_dashboard_posts
        if path == "/posts"
        else stub.classrooms.list_classroom_posts
    )


def test_feed_geral_sempre_consulta_sigaa_sem_banco_ou_fila(
    client, cookies, posts_sigaa, qstash
):
    def banco_proibido():
        pytest.fail("O feed geral não deve abrir o banco")

    client.app.dependency_overrides[get_sessionmaker] = banco_proibido
    client.cookies.update(cookies(refresh=CREDENTIALS))
    fetch = posts_sigaa.classrooms.list_dashboard_posts
    first = client.get("/posts")
    assert first.status_code == 200
    assert first.json() == [n.model_dump(mode="json") for n in fetch.return_value]
    assert first.headers["cache-control"] == "no-store"
    fetch.return_value = []
    second = client.get("/posts")
    assert second.status_code == 200
    assert second.json() == []
    assert fetch.await_count == 2
    assert posts_sigaa.aclose.await_count == 2
    assert qstash.published == []


@pytest.mark.parametrize("path", PATHS)
def test_noticias_exigem_autenticacao(client, posts_sigaa, path):
    assert client.get(path).status_code == 401
    posts_sigaa.created.assert_not_called()


@pytest.mark.parametrize("path", PATHS[1:])
def test_noticias_recusam_turma_fora_do_historico(client, cookies, posts_sigaa, path):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    _fetch(posts_sigaa, path).side_effect = ClassroomNotFound()

    response = client.get(path)
    assert response.status_code == 404
    assert response.json() == {"detail": "Classroom not found"}


def test_noticias_de_turma_do_historico(client, cookies, posts_sigaa):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    historical = posts_sigaa.classrooms.list_classrooms.return_value[0].model_copy(
        update={"id": "BBB", "sigaa_id": None, "current": False}
    )
    posts_sigaa.classrooms.list_classrooms.return_value = [historical]
    response = client.get("/classrooms/BBB/posts")
    assert response.status_code == 200
    assert response.json()[0]["classroom_sigaa_id"] is None
    posts_sigaa.classrooms.list_classroom_posts.assert_awaited_once_with("BBB")


def test_detalhe_recusa_noticia_ausente_na_turma(client, cookies, posts_sigaa):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    posts_sigaa.classrooms.get_classroom_news.side_effect = NewsNotFound()
    response = client.get("/classrooms/AAA/posts/news:2")
    assert response.status_code == 404
    assert response.json() == {"detail": "News not found"}
    posts_sigaa.classrooms.get_classroom_news.assert_awaited_once_with("AAA", 2)


@pytest.mark.parametrize("news_id", ["abc", "0", "-1"])
def test_detalhe_exige_id_inteiro_positivo(client, cookies, posts_sigaa, news_id):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    assert client.get(f"/classrooms/AAA/posts/news:{news_id}").status_code == 422
    posts_sigaa.classrooms.get_classroom_news.assert_not_awaited()


@pytest.mark.parametrize("path", PATHS)
@pytest.mark.parametrize(
    "error,code",
    [
        (AuthenticationFailed(), 401),
        (SessionExpired(), 502),
        (SigaaParseError("layout mudou"), 502),
        (httpx.ReadTimeout("SIGAA indisponível"), 502),
    ],
)
def test_erro_do_sigaa_em_noticias_nao_retorna_dados_antigos(
    client, cookies, posts_sigaa, path, error, code
):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    assert client.get(path).status_code == 200
    _fetch(posts_sigaa, path).side_effect = error

    assert client.get(path, headers={"Cache-Control": "no-cache"}).status_code == code


def test_openapi_documenta_cache_apenas_nas_noticias_de_turma(client):
    paths = client.get("/openapi.json").json()["paths"]
    for path in ("/posts", "/classrooms/{classroom_id}/posts"):
        route = paths[path]["get"]
        assert {"401", "502"} <= route["responses"].keys()
        assert any(
            p["name"] == "Cache-Control" for p in route.get("parameters", [])
        ) == (path != "/posts")
        schema = route["responses"]["200"]["content"]["application/json"]["schema"]
        assert schema["items"]["$ref"] == (
            "#/components/schemas/DashboardPost"
            if path == "/posts"
            else "#/components/schemas/ClassroomPost"
        )
    assert "404" in paths["/classrooms/{classroom_id}/posts"]["get"]["responses"]
    detail = paths["/classrooms/{classroom_id}/posts/{post_id}"]["get"]
    assert {"401", "404", "422", "502"} <= detail["responses"].keys()
    assert (
        detail["responses"]["200"]["content"]["application/json"]["schema"]["$ref"]
        == "#/components/schemas/ClassroomPost"
    )


@pytest.mark.parametrize("path", PATHS[1:])
def test_cache_de_turma_evita_nova_consulta(client, cookies, posts_sigaa, qstash, path):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    first = client.get(path)
    assert first.status_code == 200
    assert first.headers["cache-control"] == "private, no-cache"
    posts_sigaa.created.reset_mock()
    second = client.get(path)
    assert second.json() == first.json()
    assert "age" in second.headers
    _fetch(posts_sigaa, path).assert_awaited_once()
    posts_sigaa.created.assert_not_called()
    assert qstash.published == []


def test_lista_vazia_tambem_tem_cache(client, cookies, posts_sigaa):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    posts_sigaa.classrooms.list_classroom_posts.return_value = []
    assert client.get("/classrooms/AAA/posts").json() == []
    assert client.get("/classrooms/AAA/posts").json() == []
    posts_sigaa.classrooms.list_classroom_posts.assert_awaited_once()


def test_lista_vencida_retorna_cache_e_atualiza_pela_fila(
    client, cookies, posts_sigaa, database, qstash
):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    original = client.get("/classrooms/AAA/posts").json()
    with database() as session:
        classroom = session.scalar(select(DBClassroom))
        classroom.posts_synced_at = datetime.now(UTC) - timedelta(minutes=61)
        session.commit()
    posts_sigaa.classrooms.list_classroom_posts.return_value = [
        _post(id=2, title="Novo aviso", published_on=date(2026, 9, 25))
    ]
    response = client.get("/classrooms/AAA/posts")
    assert response.json() == original
    assert int(response.headers["age"]) >= 3600
    assert len(qstash.published) == 1
    assert qstash.deliveries[0].status_code == 204
    # O novo aviso foi acrescentado; o antigo não foi apagado.
    assert [n["id"] for n in client.get("/classrooms/123/posts").json()] == [
        "news:2",
        "news:1",
    ]
    assert posts_sigaa.classrooms.list_classroom_posts.await_count == 2


def test_lista_de_turma_do_historico_nao_vence(
    client, cookies, posts_sigaa, database, qstash
):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    historical = posts_sigaa.classrooms.list_classrooms.return_value[0].model_copy(
        update={"id": "BBB", "sigaa_id": None, "current": False}
    )
    posts_sigaa.classrooms.list_classrooms.return_value = [historical]
    original = client.get("/classrooms/BBB/posts").json()
    with database() as session:
        classroom = session.scalar(select(DBClassroom))
        classroom.posts_synced_at = datetime.now(UTC) - timedelta(days=365)
        session.commit()
    assert client.get("/classrooms/BBB/posts").json() == original
    assert qstash.published == []
    posts_sigaa.classrooms.list_classroom_posts.assert_awaited_once()


@pytest.mark.parametrize("remaining", [True, False])
def test_atualizar_lista_preserva_conteudo_e_noticias_removidas(
    client, cookies, posts_sigaa, database, remaining
):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    detail = client.get(DETAIL_PATH).json()
    assert client.get("/classrooms/AAA/posts").status_code == 200
    if not remaining:
        posts_sigaa.classrooms.list_classroom_posts.return_value = []
    response = client.get(
        "/classrooms/AAA/posts", headers={"Cache-Control": "no-cache"}
    )
    assert [n["id"] for n in response.json()] == ["news:1"]
    assert response.json()[0]["content"] is None
    assert client.get(DETAIL_PATH).json() == detail
    posts_sigaa.classrooms.get_classroom_news.assert_awaited_once()
    with database() as session:
        assert len(list(session.scalars(select(ClassroomPosts)))) == 1


@pytest.mark.parametrize("content", [None, "", "Texto"])
def test_conteudo_nao_expira_inclusive_quando_vazio(
    client, cookies, posts_sigaa, database, qstash, content
):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    fetch = posts_sigaa.classrooms.get_classroom_news
    fetch.return_value = fetch.return_value.model_copy(update={"content": content})
    assert client.get(DETAIL_PATH).status_code == 200
    with database() as session:
        item = session.scalar(select(ClassroomPosts))
        item.content_synced_at = datetime.now(UTC) - timedelta(days=365)
        session.commit()
    fetch.side_effect = NewsNotFound()
    response = client.get(DETAIL_PATH)
    assert response.status_code == 200
    assert response.json()["content"] == content
    assert fetch.await_count == 1
    assert qstash.published == []


def test_no_cache_atualiza_conteudo_quando_solicitado(client, cookies, posts_sigaa):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    assert client.get(DETAIL_PATH).status_code == 200
    fetch = posts_sigaa.classrooms.get_classroom_news
    fetch.return_value = fetch.return_value.model_copy(update={"content": "Atualizado"})
    response = client.get(DETAIL_PATH, headers={"Cache-Control": "no-cache"})
    assert response.json()["content"] == "Atualizado"
    assert fetch.await_count == 2


def test_cache_nao_da_acesso_a_usuario_sem_vinculo(client, cookies, posts_sigaa):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    assert client.get(DETAIL_PATH).status_code == 200
    other = Credentials(registration="251000001", password=SecretStr("senha"))
    client.cookies.clear()
    client.cookies.update(cookies(refresh=other))
    posts_sigaa.profile.get_profile.return_value = (
        posts_sigaa.profile.get_profile.return_value.model_copy(
            update={"registration": other.registration}
        )
    )
    posts_sigaa.classrooms.list_classrooms.return_value = []
    assert client.get(DETAIL_PATH).status_code == 404
    posts_sigaa.classrooms.get_classroom_news.assert_awaited_once()


def test_only_if_cached_nao_busca_noticia_ausente(client, cookies, posts_sigaa):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    assert client.get("/classrooms").status_code == 200
    for path in ("/classrooms/AAA/posts", DETAIL_PATH):
        assert (
            client.get(path, headers={"Cache-Control": "only-if-cached"}).status_code
            == 504
        )
    posts_sigaa.classrooms.list_classroom_posts.assert_not_awaited()
    posts_sigaa.classrooms.get_classroom_news.assert_not_awaited()


@pytest.mark.parametrize("path", ["/classrooms/AAA/posts", DETAIL_PATH])
def test_stale_if_error_preserva_resposta_em_falha_do_sigaa(
    client, cookies, posts_sigaa, path
):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    original = client.get(path).json()
    _fetch(posts_sigaa, path).side_effect = SigaaParseError("indisponível")
    response = client.get(path, headers={"Cache-Control": "no-cache, stale-if-error"})
    assert response.status_code == 200
    assert response.json() == original


def test_jobs_de_conteudos_distintos_nao_sao_deduplicados():
    def job(news_id: int) -> Job:
        return Job(
            credentials=CREDENTIALS,
            classroom_id="AAA",
            steps=(Step.of(sync_news_content, news_id),),
        )

    assert job(1).key != job(2).key


def test_lista_nao_busca_conteudo_ate_primeira_abertura(client, cookies, posts_sigaa):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    assert client.get("/classrooms/AAA/posts").status_code == 200
    posts_sigaa.classrooms.get_classroom_news.assert_not_awaited()
    first = client.get(DETAIL_PATH)
    assert first.status_code == 200
    assert first.json()["content"] is not None
    assert client.get(DETAIL_PATH).json() == first.json()
    posts_sigaa.classrooms.get_classroom_news.assert_awaited_once()


def test_ttl_do_conteudo_pode_ser_ativado(
    client, cookies, posts_sigaa, database, monkeypatch, qstash
):
    monkeypatch.setattr(
        "api.modules.classrooms.posts.NEWS_CONTENT_TTL", timedelta(minutes=60)
    )
    client.cookies.update(cookies(refresh=CREDENTIALS))
    original = client.get(DETAIL_PATH).json()
    with database() as session:
        item = session.scalar(select(ClassroomPosts))
        item.content_synced_at = datetime.now(UTC) - timedelta(minutes=61)
        session.commit()
    fetch = posts_sigaa.classrooms.get_classroom_news
    fetch.return_value = fetch.return_value.model_copy(update={"content": "Novo texto"})
    assert client.get(DETAIL_PATH).json() == original
    assert len(qstash.published) == 1
    assert qstash.deliveries[0].status_code == 204
    assert client.get(DETAIL_PATH).json()["content"] == "Novo texto"
    assert fetch.await_count == 2


def test_mesmo_id_de_noticia_em_turmas_distintas_nao_mistura_conteudo(
    client, cookies, posts_sigaa
):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    classrooms = posts_sigaa.classrooms.list_classrooms.return_value
    classrooms.append(
        classrooms[0].model_copy(update={"id": "BBB", "number": "02", "sigaa_id": 456})
    )
    original = client.get(DETAIL_PATH).json()
    fetch = posts_sigaa.classrooms.get_classroom_news
    fetch.return_value = fetch.return_value.model_copy(
        update={"content": "Outra turma"}
    )
    second = client.get("/classrooms/BBB/posts/news:1")
    assert second.status_code == 200
    assert second.json()["content"] == "Outra turma"
    assert second.json()["classroom_sigaa_id"] == 456
    assert client.get(DETAIL_PATH).json() == original


def _post(**kwargs):
    return ClassroomPost.from_news(News(**kwargs))


def test_posts_unificam_categorias_e_material_referencia_topico(
    client, cookies, posts_sigaa, database
):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    topic = ClassroomPost(
        id="topic:" + "a" * 64,
        type=PostType.TOPIC,
        title="Aula 1",
        starts_on=date(2026, 9, 23),
        ends_on=date(2026, 9, 24),
        content="Conceitos básicos",
    )
    material = ClassroomPost(
        id="material:" + "b" * 64,
        type=PostType.MATERIAL,
        title="Aula.pdf",
        topic_id=topic.id,
        sigaa_id="ARQUIVO123",
    )
    assessment = ClassroomPost(
        id="assessment:1",
        type=PostType.ASSESSMENT,
        sigaa_id="1",
        title="Prova 1",
        starts_on=date(2026, 10, 29),
        starts_at=datetime(2026, 10, 29, 16),
        time_label="16:00",
    )
    fetch = posts_sigaa.classrooms.list_classroom_posts
    fetch.return_value += [material, assessment, topic]
    response = client.get("/classrooms/AAA/posts")
    assert response.status_code == 200
    assert {post["type"] for post in response.json()} == {t.value for t in PostType}
    assert len({post["id"] for post in response.json()}) == 4
    for post in (topic, material, assessment):
        detail = client.get(f"/classrooms/AAA/posts/{post.id}")
        assert detail.status_code == 200
        assert detail.json() == post.model_copy(
            update={"classroom_sigaa_id": 123}
        ).model_dump(mode="json")
    assert fetch.await_count == 1
    assert (
        client.get("/classrooms/AAA/posts?type=material").json()[0]["topic_id"]
        == topic.id
    )
    assert (
        client.get("/classrooms/AAA/posts?type=assessment").json()[0]["published_on"]
        is None
    )
    assert client.get("/classrooms/AAA/posts?type=invalid").status_code == 422
    assert client.get("/classrooms/AAA/posts/assessment:999").status_code == 404
    with database() as session:
        rows = list(session.scalars(select(ClassroomPosts)))
        assert len(rows) == 4
        assert (
            next(row for row in rows if row.type == PostType.MATERIAL).topic_id
            == topic.id
        )


def test_posts_atualizam_conteudo_e_vinculo_sem_duplicar(
    client, cookies, posts_sigaa, database
):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    topic = ClassroomPost(
        id="topic:" + "a" * 64, type=PostType.TOPIC, title="Aula 1", content="Original"
    )
    fetch = posts_sigaa.classrooms.list_classroom_posts
    fetch.return_value = [topic]
    assert client.get("/classrooms/AAA/posts").status_code == 200
    fetch.return_value = [topic.model_copy(update={"content": "Atualizado"})]
    response = client.get(
        f"/classrooms/AAA/posts/{topic.id}", headers={"Cache-Control": "no-cache"}
    )
    assert response.json()["content"] == "Atualizado"
    with database() as session:
        assert len(list(session.scalars(select(ClassroomPosts)))) == 1


@pytest.mark.parametrize(
    "path",
    [
        "/classrooms/AAA/posts?type=material",
        "/classrooms/AAA/posts/assessment:1",
        "/classrooms/AAA/posts/topic:" + "a" * 64,
    ],
)
def test_posts_de_todos_os_tipos_exigem_login(client, path):
    assert client.get(path).status_code == 401
