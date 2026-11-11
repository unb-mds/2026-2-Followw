from datetime import UTC, date, datetime, timedelta

import pytest
from pydantic import SecretStr
from sigaa_client import (
    ClassroomPost,
    Credentials,
    NewsNotFound,
    PostType,
    SigaaParseError,
)
from sqlalchemy import select

from api.db.models import Classroom as DBClassroom
from api.db.models import ClassroomPosts
from api.modules.classrooms.posts import sync_news_content
from api.sync.engine import Job, Step

from .helpers import CREDENTIALS, DETAIL_PATH, PATHS, _fetch, _post


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


@pytest.mark.parametrize("current", [True, False])
@pytest.mark.parametrize("content", [None, "", "Texto"])
def test_conteudo_nao_expira_inclusive_quando_vazio(
    client, cookies, posts_sigaa, database, qstash, content, current
):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    posts_sigaa.classrooms.list_classrooms.return_value = [
        posts_sigaa.classrooms.list_classrooms.return_value[0].model_copy(
            update={"current": current}
        )
    ]
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


@pytest.mark.parametrize("headers", [{}, {"Cache-Control": "max-age=0"}])
def test_conteudo_antigo_nao_e_buscado_novamente(
    client, cookies, posts_sigaa, database, qstash, headers
):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    original = client.get(DETAIL_PATH).json()
    with database() as session:
        item = session.scalar(select(ClassroomPosts))
        item.content_synced_at = datetime.now(UTC) - timedelta(days=365)
        session.commit()
    posts_sigaa.created.reset_mock()
    assert client.get(DETAIL_PATH, headers=headers).json() == original
    assert qstash.published == []
    posts_sigaa.classrooms.get_classroom_news.assert_awaited_once()
    posts_sigaa.created.assert_not_called()


@pytest.mark.parametrize(
    ("post_type", "post_id"),
    [
        (PostType.NEWS, "news:1"),
        (PostType.TOPIC, "topic:" + "a" * 64),
        (PostType.MATERIAL, "material:" + "b" * 64),
        (PostType.ASSESSMENT, "assessment:1"),
    ],
)
def test_lista_vencida_descobre_posts_sem_sobrescrever_conteudo(
    reading_client, posts_sigaa, database, post_type, post_id
):
    client = reading_client
    fetch = posts_sigaa.classrooms.list_classroom_posts
    original = ClassroomPost(id=post_id, type=post_type, title="Aviso", content="Texto")
    fetch.return_value = [original]
    path = f"/classrooms/AAA/posts/{post_id}"
    saved = client.get(path).json()
    with database() as session:
        classroom = session.scalar(select(DBClassroom))
        classroom.posts_synced_at = datetime.now(UTC) - timedelta(minutes=61)
        session.commit()
    fetch.return_value = [
        original.model_copy(update={"title": "Editado", "content": "Editado"}),
        _post(id=2, title="Nova notícia", published_on=date(2026, 9, 25)),
    ]
    assert client.get(path).json() == saved
    count = fetch.await_count
    client.get("/classrooms/AAA/posts")
    assert fetch.await_count == count + 1
    assert client.get(path).json() == saved
    assert {post["id"] for post in client.get("/classrooms/AAA/posts").json()} == {
        post_id,
        "news:2",
    }


def test_job_de_conteudo_ignora_noticia_ja_carregada(
    reading_client, posts_sigaa, qstash
):
    from api.sync.queue import JOBS_URL, encode_job

    client = reading_client
    assert client.get(DETAIL_PATH).status_code == 200
    job = Job(
        credentials=CREDENTIALS,
        classroom_id="AAA",
        steps=(Step.of(sync_news_content, 1),),
    )
    body = encode_job(job)
    response = client.post(
        "/jobs",
        content=body,
        headers={"Upstash-Signature": qstash.sign(JOBS_URL, body)},
    )
    assert response.status_code == 204
    posts_sigaa.classrooms.get_classroom_news.assert_awaited_once()
