import pytest
from pydantic import SecretStr
from sigaa_client import ClassroomPost, Credentials, PostType
from sqlalchemy import select

from api.db.models import ClassroomPostRead, ClassroomPosts, User

from .helpers import CREDENTIALS, DETAIL_PATH, mark_read


def test_consultar_lista_detalhe_e_feed_nao_confirma_leitura(reading_client):
    client = reading_client
    listed = client.get("/classrooms/AAA/posts").json()[0]
    assert listed["is_read"] is False
    assert "version" not in listed
    for _ in range(2):
        detail = client.get(DETAIL_PATH).json()
        assert "version" not in detail
        assert detail["is_read"] is False
        assert client.get("/classrooms/AAA/posts").json()[0]["is_read"] is False
        assert client.get("/posts/news").json()["items"][0]["post"]["is_read"] is False


def test_confirma_e_desfaz_leitura_nas_tres_consultas(reading_client, database):
    client = reading_client
    post = client.get(DETAIL_PATH).json()
    for _ in range(2):
        response = mark_read(client, post)
        assert response.status_code == 204
        assert response.headers["cache-control"] == "no-store"
    detail = client.get(DETAIL_PATH).json()
    listed = client.get("/classrooms/AAA/posts").json()[0]
    feed = client.get("/posts/news").json()["items"][0]["post"]
    for item in (detail, listed, feed):
        assert item["is_read"] is True
    with database() as session:
        assert len(list(session.scalars(select(ClassroomPostRead)))) == 1
    for _ in range(2):
        response = client.delete(f"{DETAIL_PATH}/read")
        assert response.status_code == 204
        assert response.headers["cache-control"] == "no-store"
    assert client.get(DETAIL_PATH).json()["is_read"] is False
    assert client.get("/classrooms/AAA/posts").json()[0]["is_read"] is False
    assert client.get("/posts/news").json()["items"][0]["post"]["is_read"] is False
    with database() as session:
        assert list(session.scalars(select(ClassroomPostRead))) == []


def test_leitura_persiste_entre_sessoes_do_mesmo_usuario(reading_client, cookies):
    client = reading_client
    post = client.get(DETAIL_PATH).json()
    assert mark_read(client, post).status_code == 204
    client.cookies.clear()
    client.cookies.update(cookies(refresh=CREDENTIALS))
    assert client.get(DETAIL_PATH).json()["is_read"] is True


def test_leitura_e_individual_mesmo_quando_usuarios_compartilham_turma(
    reading_client, cookies, posts_sigaa
):
    client = reading_client
    post = client.get(DETAIL_PATH).json()
    assert mark_read(client, post).status_code == 204
    other = Credentials(registration="251000001", password=SecretStr("senha"))
    client.cookies.clear()
    client.cookies.update(cookies(refresh=other))
    posts_sigaa.profile.get_profile.return_value = (
        posts_sigaa.profile.get_profile.return_value.model_copy(
            update={"registration": other.registration}
        )
    )
    assert client.get(DETAIL_PATH).json()["is_read"] is False
    assert client.delete(f"{DETAIL_PATH}/read").status_code == 204
    client.cookies.clear()
    client.cookies.update(cookies(refresh=CREDENTIALS))
    assert client.get(DETAIL_PATH).json()["is_read"] is True


def test_mesmo_id_em_outra_turma_tem_leitura_independente(reading_client, posts_sigaa):
    client = reading_client
    classrooms = posts_sigaa.classrooms.list_classrooms.return_value
    classrooms.append(
        classrooms[0].model_copy(update={"id": "BBB", "number": "02", "sigaa_id": 456})
    )
    post = client.get(DETAIL_PATH).json()
    assert mark_read(client, post).status_code == 204
    other_path = "/classrooms/BBB/posts/news:1"
    assert client.get(other_path).json()["is_read"] is False
    assert mark_read(client, post, "BBB").status_code == 204
    assert client.delete(f"{other_path}/read").status_code == 204
    assert client.get(DETAIL_PATH).json()["is_read"] is True


def test_leitura_usa_identidade_interna_ao_logar_com_matricula_antiga(
    reading_client, database, cookies
):
    client = reading_client
    post = client.get(DETAIL_PATH).json()
    assert mark_read(client, post).status_code == 204
    with database() as session:
        user = session.scalar(select(User))
        user.old_registration = "231000000"
        session.commit()
    client.cookies.clear()
    client.cookies.update(
        cookies(
            refresh=Credentials(registration="231000000", password=SecretStr("senha"))
        )
    )
    assert client.get(DETAIL_PATH).json()["is_read"] is True
    assert client.delete(f"{DETAIL_PATH}/read").status_code == 204
    assert client.get(DETAIL_PATH).json()["is_read"] is False


def test_troca_de_curso_preserva_leituras_ao_absorver_usuario_sombra(
    reading_client, posts_sigaa, database
):
    client = reading_client
    posts_sigaa.classrooms.list_classroom_posts.return_value.append(
        ClassroomPost(id="assessment:1", type=PostType.ASSESSMENT, title="Prova")
    )
    original = client.get(DETAIL_PATH).json()
    assert mark_read(client, original).status_code == 204
    assert client.get("/classrooms/AAA/posts").status_code == 200
    with database() as session:
        shadow = User(name="Sombra", registration="252000000")
        session.add(shadow)
        session.flush()
        for post in session.scalars(select(ClassroomPosts)):
            session.add(
                ClassroomPostRead(
                    user_id=shadow.id,
                    post_id=post.id,
                )
            )
        session.commit()
    posts_sigaa.profile.get_profile.return_value = (
        posts_sigaa.profile.get_profile.return_value.model_copy(
            update={"registration": "252000000"}
        )
    )
    assert client.get("/me", headers={"Cache-Control": "no-cache"}).status_code == 200
    listed = client.get("/classrooms/AAA/posts").json()
    assert {post["id"]: post["is_read"] for post in listed} == {
        "news:1": True,
        "assessment:1": True,
    }
    with database() as session:
        users = list(session.scalars(select(User)))
        assert len(users) == 1
        reads = list(session.scalars(select(ClassroomPostRead)))
        assert len(reads) == 2
        assert {read.user_id for read in reads} == {users[0].id}


def test_noticia_sem_conteudo_carregado_pode_ser_marcada(reading_client, posts_sigaa):
    client = reading_client
    listed = client.get("/classrooms/AAA/posts").json()[0]
    assert listed["content"] is None
    assert mark_read(client, listed).status_code == 204
    assert client.get("/classrooms/AAA/posts").json()[0]["is_read"] is True
    posts_sigaa.classrooms.get_classroom_news.assert_not_awaited()


@pytest.mark.parametrize("content", [None, ""])
def test_noticia_com_conteudo_vazio_carregado_pode_ser_lida(
    reading_client, posts_sigaa, content
):
    fetch = posts_sigaa.classrooms.get_classroom_news
    fetch.return_value = fetch.return_value.model_copy(update={"content": content})
    post = reading_client.get(DETAIL_PATH).json()
    assert mark_read(reading_client, post).status_code == 204
    assert reading_client.get(DETAIL_PATH).json()["is_read"] is True


@pytest.mark.parametrize("method", ["put", "delete"])
def test_alterar_leitura_recusa_turma_sem_vinculo(reading_client, method):
    client = reading_client
    client.get(DETAIL_PATH)
    assert (
        client.request(method, "/classrooms/OUTRA/posts/news:1/read").status_code == 404
    )


@pytest.mark.parametrize("method", ["put", "delete"])
def test_alterar_leitura_recusa_post_ausente(reading_client, method):
    client = reading_client
    client.get("/classrooms/AAA/posts")
    assert (
        client.request(method, "/classrooms/AAA/posts/news:999/read").status_code == 404
    )
