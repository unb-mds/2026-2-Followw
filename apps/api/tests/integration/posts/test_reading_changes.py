from datetime import UTC, date, datetime, timedelta

import pytest
from sigaa_client import ClassroomPost, NewsAttachment, PostType
from sqlalchemy import select

from api.db.models import ClassroomPosts

from .helpers import DETAIL_PATH, mark_read


@pytest.mark.parametrize(
    "change",
    [
        {"title": "Título editado"},
        {"content": "Texto editado"},
        {
            "attachments": (
                NewsAttachment(name="Outro.pdf", url="https://sigaa.unb.br/outro.pdf"),
            )
        },
        {"attachments": ()},
    ],
)
def test_edicao_de_noticia_invalida_leitura_e_recusa_versao_antiga(
    reading_client, posts_sigaa, change
):
    client = reading_client
    original = client.get(DETAIL_PATH).json()
    assert mark_read(client, original).status_code == 204
    fetch = posts_sigaa.classrooms.get_classroom_news
    fetch.return_value = fetch.return_value.model_copy(update=change)
    updated = client.get(DETAIL_PATH, headers={"Cache-Control": "no-cache"}).json()
    assert updated["version"] != original["version"]
    assert updated["is_read"] is False
    assert mark_read(client, original).status_code == 409
    assert client.get(DETAIL_PATH).json()["is_read"] is False
    assert mark_read(client, updated).status_code == 204
    assert client.get(DETAIL_PATH).json()["is_read"] is True


def test_titulo_alterado_na_listagem_invalida_leitura_do_detalhe(
    reading_client, posts_sigaa
):
    client = reading_client
    original = client.get(DETAIL_PATH).json()
    assert mark_read(client, original).status_code == 204
    fetch = posts_sigaa.classrooms.list_classroom_posts
    fetch.return_value = [
        p.model_copy(update={"title": "Novo título"}) for p in fetch.return_value
    ]
    listed = client.get(
        "/classrooms/AAA/posts", headers={"Cache-Control": "no-cache"}
    ).json()[0]
    assert listed["version"] != original["version"]
    assert listed["is_read"] is False
    assert client.get(DETAIL_PATH).json()["is_read"] is False


def test_revalidar_sem_mudanca_ou_corrigir_data_publicacao_preserva_leitura(
    reading_client, posts_sigaa
):
    client = reading_client
    original = client.get(DETAIL_PATH).json()
    assert mark_read(client, original).status_code == 204
    fetch = posts_sigaa.classrooms.get_classroom_news
    fetch.return_value = fetch.return_value.model_copy(
        update={
            "published_on": date(2026, 9, 25),
            "published_at": datetime(2026, 9, 25, 12),
        }
    )
    updated = client.get(DETAIL_PATH, headers={"Cache-Control": "no-cache"}).json()
    assert updated["version"] == original["version"]
    assert updated["is_read"] is True
    listed = client.get(
        "/classrooms/AAA/posts", headers={"Cache-Control": "no-cache"}
    ).json()[0]
    assert listed["version"] == original["version"]
    assert listed["is_read"] is True


def test_restaurar_texto_antigo_nao_restaura_leitura(reading_client, posts_sigaa):
    client = reading_client
    original = client.get(DETAIL_PATH).json()
    assert mark_read(client, original).status_code == 204
    fetch = posts_sigaa.classrooms.get_classroom_news
    source = fetch.return_value
    fetch.return_value = source.model_copy(update={"content": "Edição intermediária"})
    edited = client.get(DETAIL_PATH, headers={"Cache-Control": "no-cache"}).json()
    fetch.return_value = source
    restored = client.get(DETAIL_PATH, headers={"Cache-Control": "no-cache"}).json()
    assert len({p["version"] for p in (original, edited, restored)}) == 3
    assert restored["is_read"] is False


@pytest.mark.parametrize(
    ("post_type", "source_id", "change"),
    [
        (PostType.TOPIC, "topic:" + "a" * 64, {"content": "Texto novo"}),
        (PostType.MATERIAL, "material:" + "b" * 64, {"title": "Material novo"}),
        (
            PostType.MATERIAL,
            "material:" + "b" * 64,
            {"url": "https://sigaa.unb.br/novo.pdf"},
        ),
        (PostType.ASSESSMENT, "assessment:1", {"starts_on": date(2026, 10, 30)}),
        (
            PostType.ASSESSMENT,
            "assessment:1",
            {"starts_at": datetime(2026, 10, 29, 18)},
        ),
        (PostType.ASSESSMENT, "assessment:1", {"time_label": "Após a aula"}),
    ],
)
def test_outros_tipos_confirmam_leitura_e_invalidam_apos_edicao(
    reading_client, posts_sigaa, post_type, source_id, change
):
    client = reading_client
    post = ClassroomPost(
        id=source_id,
        type=post_type,
        title="Original",
        content="Texto original",
        starts_on=date(2026, 10, 29),
        starts_at=datetime(2026, 10, 29, 16),
    )
    fetch = posts_sigaa.classrooms.list_classroom_posts
    fetch.return_value = [post]
    original = client.get("/classrooms/AAA/posts").json()[0]
    assert mark_read(client, original).status_code == 204
    assert client.get(f"/classrooms/AAA/posts/{source_id}").json()["is_read"] is True
    fetch.return_value = [post.model_copy(update=change)]
    updated = client.get(
        "/classrooms/AAA/posts", headers={"Cache-Control": "no-cache"}
    ).json()[0]
    assert updated["version"] != original["version"]
    assert updated["is_read"] is False
    assert mark_read(client, original).status_code == 409
    assert mark_read(client, updated).status_code == 204
    assert client.delete(f"/classrooms/AAA/posts/{source_id}/read").status_code == 204
    assert client.get(f"/classrooms/AAA/posts/{source_id}").json()["is_read"] is False


def test_edicao_em_segundo_plano_invalida_leitura_na_consulta_seguinte(
    reading_client, posts_sigaa, database, qstash
):
    client = reading_client
    original = client.get(DETAIL_PATH).json()
    assert mark_read(client, original).status_code == 204
    with database() as session:
        post = session.scalar(select(ClassroomPosts))
        post.content_synced_at = datetime.now(UTC) - timedelta(minutes=61)
        session.commit()
    fetch = posts_sigaa.classrooms.get_classroom_news
    fetch.return_value = fetch.return_value.model_copy(update={"content": "Editado"})
    stale = client.get(DETAIL_PATH).json()
    assert stale["is_read"] is True
    assert stale["version"] == original["version"]
    assert qstash.deliveries[-1].status_code == 204
    fresh = client.get(DETAIL_PATH).json()
    assert fresh["is_read"] is False
    assert fresh["version"] != original["version"]


def test_nova_postagem_nao_herda_leitura_de_outra(reading_client, posts_sigaa):
    client = reading_client
    original = client.get(DETAIL_PATH).json()
    assert mark_read(client, original).status_code == 204
    fetch = posts_sigaa.classrooms.list_classroom_posts
    fetch.return_value.append(
        ClassroomPost(
            id="assessment:9", type=PostType.ASSESSMENT, title="Nova avaliação"
        )
    )
    listed = client.get(
        "/classrooms/AAA/posts", headers={"Cache-Control": "no-cache"}
    ).json()
    assert {p["id"]: p["is_read"] for p in listed} == {
        "news:1": True,
        "assessment:9": False,
    }
