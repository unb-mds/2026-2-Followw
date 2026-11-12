from datetime import UTC, date, datetime, timedelta

from sigaa_client import ClassroomPost, DashboardPost, PostType
from sqlalchemy import select

from api.db.models import User

from .helpers import DETAIL_PATH, _post, mark_read

AVISO = DashboardPost(
    type=PostType.NEWS,
    classroom_sigaa_id=123,
    title="Aviso",
    published_on=date(2026, 9, 24),
)
PROVA = ClassroomPost(
    id="assessment:1",
    type=PostType.ASSESSMENT,
    title="Avaliação A2",
    starts_on=date(2026, 10, 29),
)


def _duas_turmas(posts_sigaa):
    original = posts_sigaa.classrooms.list_classrooms.return_value[0]
    posts_sigaa.classrooms.list_classrooms.return_value = [
        original,
        original.model_copy(update={"id": "BBB", "sigaa_id": 124, "number": "02"}),
    ]


def _turmas_lidas(posts_sigaa):
    return [
        call.args[0]
        for call in posts_sigaa.classrooms.list_classroom_posts.await_args_list
    ]


def _home_vencida(database, idade=timedelta(minutes=61)):
    with database() as session:
        user = session.scalar(select(User))
        user.dashboard_synced_at = datetime.now(UTC) - idade
        session.commit()


def test_home_rele_so_a_turma_com_novidade(reading_client, posts_sigaa, qstash):
    client = reading_client
    _duas_turmas(posts_sigaa)
    client.get("/classrooms/AAA/posts")
    client.get("/classrooms/BBB/posts")
    posts_sigaa.classrooms.list_dashboard_posts.return_value = [
        AVISO,
        AVISO.model_copy(update={"classroom_sigaa_id": 124, "title": "Novo aviso"}),
    ]
    posts_sigaa.classrooms.list_classroom_posts.reset_mock()
    response = client.get("/posts/news")
    assert response.json()["updating"] is True
    assert [step.task for step in qstash.jobs()[-1].steps] == ["sync_dashboard_posts"]
    assert _turmas_lidas(posts_sigaa) == ["BBB"]


def test_home_sem_novidade_nao_rele_turmas_e_vale_uma_hora(
    reading_client, posts_sigaa, database, qstash
):
    client = reading_client
    client.get("/classrooms/AAA/posts")
    posts_sigaa.classrooms.list_dashboard_posts.return_value = [AVISO]
    posts_sigaa.classrooms.list_classroom_posts.reset_mock()
    client.get("/posts/news")
    posts_sigaa.classrooms.list_dashboard_posts.assert_awaited_once()
    assert _turmas_lidas(posts_sigaa) == []

    qstash.published.clear()
    assert client.get("/posts/news").json()["updating"] is False
    assert qstash.published == []

    _home_vencida(database)
    assert client.get("/posts/news").json()["updating"] is True
    assert posts_sigaa.classrooms.list_dashboard_posts.await_count == 2


def test_avaliacao_adiada_na_home_atualiza_a_turma(
    reading_client, posts_sigaa, database
):
    client = reading_client
    fetch = posts_sigaa.classrooms.list_classroom_posts
    fetch.return_value = [PROVA]
    client.get("/classrooms/AAA/posts")
    home = DashboardPost(
        type=PostType.ASSESSMENT,
        classroom_sigaa_id=123,
        title="Avaliação A2",
        starts_on=date(2026, 10, 29),
    )
    posts_sigaa.classrooms.list_dashboard_posts.return_value = [home]
    client.get("/posts/news")
    assert fetch.await_count == 1

    adiada = date(2026, 11, 5)
    posts_sigaa.classrooms.list_dashboard_posts.return_value = [
        home.model_copy(update={"starts_on": adiada})
    ]
    fetch.return_value = [PROVA.model_copy(update={"starts_on": adiada})]
    _home_vencida(database)
    client.get("/posts/news")
    assert fetch.await_count == 2
    posts = client.get("/classrooms/AAA/posts").json()
    assert posts[0]["starts_on"] == "2026-11-05"


def test_home_ignora_itens_de_turma_desconhecida(reading_client, posts_sigaa):
    client = reading_client
    client.get("/classrooms/AAA/posts")
    posts_sigaa.classrooms.list_dashboard_posts.return_value = [
        AVISO,
        AVISO.model_copy(update={"classroom_sigaa_id": 999, "title": "Outra"}),
        AVISO.model_copy(update={"classroom_sigaa_id": None, "title": "Sem turma"}),
    ]
    posts_sigaa.classrooms.list_classroom_posts.reset_mock()
    client.get("/posts/news")
    posts_sigaa.classrooms.list_dashboard_posts.assert_awaited_once()
    assert _turmas_lidas(posts_sigaa) == []


def test_lista_sem_cache_na_turma_e_lida_pela_home(reading_client, posts_sigaa):
    client = reading_client
    client.get("/classrooms")
    posts_sigaa.classrooms.list_classroom_posts.return_value = [
        _post(id=1, title="Aviso", published_on=date(2026, 9, 24))
    ]
    client.get("/posts/news")
    assert _turmas_lidas(posts_sigaa) == ["AAA"]
    assert [
        item["post"]["id"] for item in client.get("/posts/news").json()["items"]
    ] == ["news:1"]


def test_noticia_editada_atualiza_titulo_e_rebusca_conteudo_uma_vez(
    reading_client, posts_sigaa, database
):
    client = reading_client
    lista = posts_sigaa.classrooms.list_classroom_posts
    detalhe = posts_sigaa.classrooms.get_classroom_news
    client.get("/classrooms/AAA/posts")
    noticia = client.get(DETAIL_PATH).json()
    assert mark_read(client, noticia).status_code == 204
    posts_sigaa.classrooms.list_dashboard_posts.return_value = [AVISO]
    client.get("/posts/news")
    assert lista.await_count == 1

    corrigido = "Aviso corrigido"
    posts_sigaa.classrooms.list_dashboard_posts.return_value = [
        AVISO.model_copy(update={"title": corrigido})
    ]
    lista.return_value = [_post(id=1, title=corrigido, published_on=date(2026, 9, 24))]
    detalhe.return_value = detalhe.return_value.model_copy(
        update={"title": corrigido, "content": "Texto corrigido"}
    )
    for _ in range(2):
        _home_vencida(database)
        client.get("/posts/news")
    assert lista.await_count == 2

    listado = client.get("/classrooms/AAA/posts").json()[0]
    assert (listado["title"], listado["is_read"]) == (corrigido, True)
    atualizado = client.get(DETAIL_PATH).json()
    assert atualizado["content"] == "Texto corrigido"
    assert detalhe.await_count == 2
