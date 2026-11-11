from datetime import date

import pytest
from sigaa_client import (
    ClassroomPost,
    News,
)

from api.db.main import get_sessionmaker

from .helpers import CREDENTIALS


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
