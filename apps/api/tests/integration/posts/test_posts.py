from datetime import date, datetime

import pytest
from sigaa_client import (
    ClassroomNotFound,
    ClassroomPost,
    NewsNotFound,
    PostType,
    SigaaParseError,
)
from sqlalchemy import select

from api.db.models import ClassroomPosts

from .helpers import CREDENTIALS, DETAIL_PATH, PATHS, _fetch


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


def test_detalhe_exige_id_inteiro_positivo(client, cookies, posts_sigaa, subtests):
    for news_id in ["abc", "0", "-1"]:
        with subtests.test(news_id=news_id):
            client.cookies.update(cookies(refresh=CREDENTIALS))
            assert (
                client.get(f"/classrooms/AAA/posts/news:{news_id}").status_code == 422
            )
            posts_sigaa.classrooms.get_classroom_news.assert_not_awaited()


@pytest.mark.parametrize("path", PATHS)
def test_erro_do_sigaa_em_noticias_nao_retorna_dados_antigos(
    client, cookies, posts_sigaa, path
):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    assert client.get(path).status_code == 200
    _fetch(posts_sigaa, path).side_effect = SigaaParseError("layout mudou")

    assert client.get(path, headers={"Cache-Control": "no-cache"}).status_code == 502


def test_openapi_documenta_cache_apenas_nas_noticias_de_turma(api):
    paths = api.get("/openapi.json").json()["paths"]
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
            else "#/components/schemas/ClassroomPostView"
        )
    assert "404" in paths["/classrooms/{classroom_id}/posts"]["get"]["responses"]
    detail = paths["/classrooms/{classroom_id}/posts/{post_id}"]["get"]
    assert {"401", "404", "422", "502"} <= detail["responses"].keys()
    assert (
        detail["responses"]["200"]["content"]["application/json"]["schema"]["$ref"]
        == "#/components/schemas/ClassroomPostView"
    )


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
        assert detail.json()["version"] is not None
        assert detail.json()["is_read"] is False
        assert {
            k: v for k, v in detail.json().items() if k not in {"version", "is_read"}
        } == post.model_copy(update={"classroom_sigaa_id": 123}).model_dump(mode="json")
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
