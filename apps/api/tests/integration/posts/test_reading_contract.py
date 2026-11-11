from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from sqlalchemy.engine.result import ChunkedIteratorResult, SimpleResultMetaData
from sqlalchemy.ext.asyncio import AsyncSession

from api.modules.classrooms.post_reading import PostReadingRepository
from api.modules.classrooms.posts import ClassroomPostsService

from .helpers import DETAIL_PATH


@pytest.mark.parametrize("has_readings", [False, True])
def test_consulta_converte_resultado_sqlalchemy_em_versoes(probe_app, has_readings):
    post_ids = [uuid4(), uuid4()]
    versions = [uuid4(), uuid4()]
    rows = list(zip(post_ids, versions)) if has_readings else []
    session = AsyncMock(spec=AsyncSession)
    session.execute.return_value = ChunkedIteratorResult(
        SimpleResultMetaData(["post_id", "version"]), lambda size: iter([rows])
    )

    async def consultar() -> dict[UUID, UUID]:
        return await PostReadingRepository(session).versions(uuid4(), post_ids)

    response = probe_app(consultar).get("/probe")
    assert response.status_code == 200
    assert response.json() == {str(post_id): str(version) for post_id, version in rows}


@pytest.mark.parametrize("method", ["put", "delete"])
def test_alterar_leitura_exige_login(api, method):
    kwargs = {"json": {"version": str(uuid4())}} if method == "put" else {}
    assert api.request(method, f"{DETAIL_PATH}/read", **kwargs).status_code == 401


def test_confirmacao_valida_versao_e_id_sem_acessar_banco(api, subtests):
    service = AsyncMock()
    api.app.dependency_overrides[ClassroomPostsService] = lambda: service
    for body in ({}, {"version": None}, {"version": "inválida"}, []):
        with subtests.test(body=body):
            assert api.put(f"{DETAIL_PATH}/read", json=body).status_code == 422
    for post_id in ("news:0", "news:-1", "assessment:abc", "material:123", "inválido"):
        with subtests.test(post_id=post_id):
            path = f"/classrooms/AAA/posts/{post_id}/read"
            assert api.put(path, json={"version": str(uuid4())}).status_code == 422
            assert api.delete(path).status_code == 422
    service.mark_read.assert_not_awaited()


def test_mutacoes_de_leitura_retornam_no_store(api):
    service = AsyncMock()
    api.app.dependency_overrides[ClassroomPostsService] = lambda: service
    marked = api.put(f"{DETAIL_PATH}/read", json={"version": str(uuid4())})
    unmarked = api.delete(f"{DETAIL_PATH}/read")
    for response in (marked, unmarked):
        assert response.status_code == 204
        assert response.content == b""
        assert response.headers["cache-control"] == "no-store"


def test_openapi_documenta_leitura_e_conflitos(api):
    schema = api.get("/openapi.json").json()
    view = schema["components"]["schemas"]["ClassroomPostView"]
    assert {"version", "is_read"} <= set(view["required"])
    route = schema["paths"]["/classrooms/{classroom_id}/posts/{post_id}/read"]
    assert {"204", "401", "404", "409", "422"} <= route["put"]["responses"].keys()
    assert {"204", "401", "404", "422"} <= route["delete"]["responses"].keys()
