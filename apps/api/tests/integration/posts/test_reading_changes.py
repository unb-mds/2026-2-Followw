import pytest
from sigaa_client import ClassroomPost, PostType

from .helpers import DETAIL_PATH, mark_read


def test_atualizar_noticia_com_no_cache_preserva_leitura(reading_client, posts_sigaa):
    client = reading_client
    original = client.get(DETAIL_PATH).json()
    assert mark_read(client, original).status_code == 204
    fetch = posts_sigaa.classrooms.get_classroom_news
    fetch.return_value = fetch.return_value.model_copy(
        update={
            "title": "Título editado",
            "content": "Texto editado",
            "attachments": (),
        }
    )
    updated = client.get(DETAIL_PATH, headers={"Cache-Control": "no-cache"}).json()
    assert updated["content"] == "Texto editado"
    assert updated["attachments"] == []
    assert updated["is_read"] is True
    assert "version" not in updated
    assert client.get("/classrooms/AAA/posts").json()[0]["is_read"] is True
    assert client.get("/posts/news").json()["items"][0]["post"]["is_read"] is True


@pytest.mark.parametrize(
    ("post_type", "source_id"),
    [
        (PostType.TOPIC, "topic:" + "a" * 64),
        (PostType.MATERIAL, "material:" + "b" * 64),
        (PostType.ASSESSMENT, "assessment:1"),
    ],
)
def test_outros_tipos_preservam_leitura_ao_atualizar_conteudo(
    reading_client, posts_sigaa, post_type, source_id
):
    client = reading_client
    post = ClassroomPost(
        id=source_id, type=post_type, title="Original", content="Texto"
    )
    fetch = posts_sigaa.classrooms.list_classroom_posts
    fetch.return_value = [post]
    original = client.get("/classrooms/AAA/posts").json()[0]
    assert mark_read(client, original).status_code == 204
    fetch.return_value = [
        post.model_copy(update={"title": "Novo", "content": "Editado"})
    ]
    path = f"/classrooms/AAA/posts/{source_id}"
    updated = client.get(path, headers={"Cache-Control": "no-cache"}).json()
    assert updated["content"] == "Editado"
    assert updated["is_read"] is True
    assert client.delete(f"{path}/read").status_code == 204
    assert client.get(path).json()["is_read"] is False


def test_nova_postagem_nao_herda_leitura_de_outra(reading_client, posts_sigaa):
    client = reading_client
    original = client.get(DETAIL_PATH).json()
    assert mark_read(client, original).status_code == 204
    posts_sigaa.classrooms.list_classroom_posts.return_value.append(
        ClassroomPost(
            id="assessment:9", type=PostType.ASSESSMENT, title="Nova avaliação"
        )
    )
    listed = client.get(
        "/classrooms/AAA/posts", headers={"Cache-Control": "no-cache"}
    ).json()
    assert {post["id"]: post["is_read"] for post in listed} == {
        "news:1": True,
        "assessment:9": False,
    }
