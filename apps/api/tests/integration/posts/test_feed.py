from datetime import date

from sigaa_client import ClassroomPost, News, PostType

from api import academic_calendar

from .helpers import CREDENTIALS


def test_feed_sem_turmas_nao_agenda_jobs(client, cookies, posts_sigaa, qstash):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    posts_sigaa.classrooms.list_classrooms.return_value = []
    client.get("/classrooms")
    qstash.published.clear()
    response = client.get("/posts")
    assert response.json() == {"items": [], "updating": False}
    assert qstash.published == []


def test_feed_nao_busca_conteudo_das_noticias(client, cookies, posts_sigaa):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    client.get("/classrooms/123/posts")
    response = client.get("/posts")
    assert response.json()["items"][0]["post"]["content"] is None
    posts_sigaa.classrooms.get_classroom_news.assert_not_awaited()


def test_noticias_agregadas_retornam_ate_cinco_com_ids_e_conteudo_salvo(
    client, cookies, posts_sigaa, id_da_turma
):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    posts_sigaa.classrooms.list_classroom_posts.return_value = [
        ClassroomPost.from_news(
            News(id=i, title="Aviso", published_on=date(2026, 9, i))
        )
        for i in range(1, 8)
    ]
    client.get("/classrooms/123/posts")
    posts_sigaa.classrooms.get_classroom_news.return_value = News(
        id=7, title="Aviso", published_on=date(2026, 9, 7), content="Texto salvo"
    )
    client.get("/classrooms/123/posts/news:7")
    response = client.get("/posts")
    assert response.status_code == 200
    items = response.json()["items"]
    assert [item["post"]["id"] for item in items] == [
        f"news:{i}" for i in range(7, 2, -1)
    ]
    assert items[0]["post"]["content"] == "Texto salvo"
    assert all(item["classroom"]["id"] == id_da_turma("AAA") for item in items)


def test_noticias_agregadas_preservam_mesmo_titulo_dia_e_id_em_turmas_distintas(
    client, cookies, posts_sigaa, id_da_turma
):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    original = posts_sigaa.classrooms.list_classrooms.return_value[0]
    posts_sigaa.classrooms.list_classrooms.return_value = [
        original,
        original.model_copy(update={"id": "BBB", "sigaa_id": 124, "number": "02"}),
    ]
    client.get("/classrooms/123/posts")
    client.get("/classrooms/124/posts")
    items = client.get("/posts").json()["items"]
    assert len(items) == 2
    assert {item["classroom"]["id"] for item in items} == {
        id_da_turma("AAA"),
        id_da_turma("BBB"),
    }
    assert [item["post"]["id"] for item in items] == ["news:1", "news:1"]


def test_feed_frio_le_a_home_e_devolve_cache_sem_esperar_a_turma(
    client, cookies, posts_sigaa, qstash
):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    client.get("/classrooms")
    posts_sigaa.created.reset_mock()
    response = client.get("/posts")
    assert response.json() == {"items": [], "updating": True}
    posts_sigaa.classrooms.list_classroom_posts.assert_awaited_once()
    assert len(qstash.published) == 1
    assert [step.task for step in qstash.jobs()[0].steps] == ["sync_dashboard_posts"]
    assert client.get("/posts").json()["items"][0]["post"]["id"] == "news:1"


def test_feed_devolve_noticias_disponiveis_enquanto_outra_turma_nao_tem_cache(
    client, cookies, posts_sigaa, id_da_turma
):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    original = posts_sigaa.classrooms.list_classrooms.return_value[0]
    posts_sigaa.classrooms.list_classrooms.return_value = [
        original,
        original.model_copy(update={"id": "BBB", "sigaa_id": 124, "number": "02"}),
    ]
    client.get("/classrooms/123/posts")
    response = client.get("/posts")
    assert response.status_code == 200
    assert response.json()["updating"] is True
    assert [item["classroom"]["id"] for item in response.json()["items"]] == [
        id_da_turma("AAA")
    ]


def _avaliacao(numero, dia):
    return ClassroomPost(
        id=f"assessment:{numero}",
        type=PostType.ASSESSMENT,
        title=f"Avaliação {numero}",
        starts_on=dia,
    )


def test_feed_traz_noticias_e_so_avaliacoes_futuras_do_cache(
    client, cookies, posts_sigaa, monkeypatch
):
    monkeypatch.setattr(academic_calendar, "today", lambda: date(2026, 10, 10))
    client.cookies.update(cookies(refresh=CREDENTIALS))
    posts_sigaa.classrooms.list_classroom_posts.return_value.extend(
        [
            _avaliacao(1, date(2026, 10, 9)),
            _avaliacao(3, date(2026, 11, 20)),
            _avaliacao(2, date(2026, 10, 10)),
        ]
    )
    client.get("/classrooms/123/posts")
    posts_sigaa.classrooms.list_dashboard_posts.reset_mock()
    items = client.get("/posts").json()["items"]
    assert [(i["post"]["type"], i["post"]["id"]) for i in items] == [
        ("news", "news:1"),
        ("assessment", "assessment:2"),
        ("assessment", "assessment:3"),
    ]
    posts_sigaa.classrooms.list_dashboard_posts.assert_awaited_once()


def test_feed_nao_limita_as_avaliacoes_futuras(
    client, cookies, posts_sigaa, monkeypatch
):
    monkeypatch.setattr(academic_calendar, "today", lambda: date(2026, 10, 1))
    client.cookies.update(cookies(refresh=CREDENTIALS))
    posts_sigaa.classrooms.list_classroom_posts.return_value.extend(
        _avaliacao(i, date(2026, 10, i + 1)) for i in range(1, 9)
    )
    client.get("/classrooms/123/posts")
    items = client.get("/posts").json()["items"]
    assessments = [i["post"]["id"] for i in items if i["post"]["type"] == "assessment"]
    assert assessments == [f"assessment:{i}" for i in range(1, 9)]
