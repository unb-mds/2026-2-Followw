from unittest.mock import AsyncMock

import pytest

from api.modules.classrooms.posts import ClassroomPostsService

from .helpers import DETAIL_PATH


@pytest.mark.parametrize("method", ["put", "delete"])
def test_alterar_leitura_exige_login(api, method):
    assert api.request(method, f"{DETAIL_PATH}/read").status_code == 401


def test_confirmacao_valida_id_sem_acessar_banco(api, subtests):
    service = AsyncMock()
    api.app.dependency_overrides[ClassroomPostsService] = lambda: service
    for post_id in ("news:0", "news:-1", "assessment:abc", "material:123", "inválido"):
        with subtests.test(post_id=post_id):
            path = f"/classrooms/123/posts/{post_id}/read"
            assert api.put(path).status_code == 422
            assert api.delete(path).status_code == 422
    service.mark_read.assert_not_awaited()


def test_openapi_documenta_leitura(api):
    schema = api.get("/openapi.json").json()
    view = schema["components"]["schemas"]["ClassroomPostView"]
    assert "is_read" in view["required"]
    route = schema["paths"]["/classrooms/{classroom_id}/posts/{post_id}/read"]
    assert {"204", "401", "404", "422"} <= route["put"]["responses"].keys()
    assert {"204", "401", "404", "422"} <= route["delete"]["responses"].keys()

    assert "requestBody" not in route["put"]
