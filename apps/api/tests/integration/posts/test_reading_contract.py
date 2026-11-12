from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from sqlalchemy.engine.result import ChunkedIteratorResult, SimpleResultMetaData
from sqlalchemy.ext.asyncio import AsyncSession

from api.modules.classrooms.post_reading import PostReadingRepository
from api.modules.classrooms.posts import ClassroomPostsService

from .helpers import DETAIL_PATH


@pytest.mark.parametrize("has_readings", [False, True])
def test_consulta_converte_resultado_sqlalchemy_em_posts_lidos(probe_app, has_readings):
    post_ids = [uuid4(), uuid4()]
    rows = [(post_id,) for post_id in post_ids] if has_readings else []
    session = AsyncMock(spec=AsyncSession)
    session.scalars.return_value = ChunkedIteratorResult(
        SimpleResultMetaData(["post_id"]), lambda size: iter([rows])
    ).scalars()

    async def consultar() -> set[UUID]:
        return await PostReadingRepository(session).read_ids(uuid4(), post_ids)

    response = probe_app(consultar).get("/probe")
    assert response.status_code == 200
    assert set(response.json()) == {str(row[0]) for row in rows}


@pytest.mark.parametrize("method", ["put", "delete"])
def test_alterar_leitura_exige_login(api, method):
    assert api.request(method, f"{DETAIL_PATH}/read").status_code == 401


def test_confirmacao_valida_id_sem_acessar_banco(api, subtests):
    service = AsyncMock()
    api.app.dependency_overrides[ClassroomPostsService] = lambda: service
    for post_id in ("news:0", "news:-1", "assessment:abc", "material:123", "inválido"):
        with subtests.test(post_id=post_id):
            path = f"/classrooms/AAA/posts/{post_id}/read"
            assert api.put(path).status_code == 422
            assert api.delete(path).status_code == 422
    service.mark_read.assert_not_awaited()


def test_mutacoes_de_leitura_retornam_no_store(api):
    service = AsyncMock()
    api.app.dependency_overrides[ClassroomPostsService] = lambda: service
    marked = api.put(f"{DETAIL_PATH}/read")
    unmarked = api.delete(f"{DETAIL_PATH}/read")
    for response in (marked, unmarked):
        assert response.status_code == 204
        assert response.content == b""
        assert response.headers["cache-control"] == "no-store"


def test_openapi_documenta_leitura(api):
    schema = api.get("/openapi.json").json()
    view = schema["components"]["schemas"]["ClassroomPostView"]
    assert "is_read" in view["required"]
    assert "version" not in view["properties"]
    route = schema["paths"]["/classrooms/{classroom_id}/posts/{post_id}/read"]
    assert {"204", "401", "404", "422"} <= route["put"]["responses"].keys()
    assert "409" not in route["put"]["responses"]
    assert {"204", "401", "404", "422"} <= route["delete"]["responses"].keys()

    assert "requestBody" not in route["put"]
