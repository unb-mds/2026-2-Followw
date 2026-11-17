from urllib.parse import quote

import pytest
from pydantic import SecretStr
from sigaa_client import (
    ClassroomNotFound,
    Credentials,
    MaterialFile,
    MaterialNotFound,
    SigaaParseError,
)

from api.cookies import ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME

POST_ID = "material:" + "a" * 64
PATH = f"/classrooms/123/posts/{POST_ID}/download"
CREDENTIALS = Credentials(registration="251000000", password=SecretStr("senha"))


@pytest.mark.parametrize(
    "kind,content,name",
    [
        ("application/pdf", b"%PDF-1.7 conteudo", "Anotações.pdf"),
        ("text/plain; charset=utf-8", b"texto", "Texto.txt"),
        ("application/zip", b"PK\x03\x04dados", 'Arquivos "aula".zip'),
    ],
)
def test_download_preserva_arquivo_cookies_e_nao_usa_cache(
    material_api, cookies, kind, content, name
):
    api, service, sigaa = material_api
    api.cookies.update(cookies(refresh=CREDENTIALS))
    sigaa.classrooms.download_classroom_material.return_value = MaterialFile(
        content=content, filename=name, content_type=kind
    )
    for _ in range(2):
        response = api.post(PATH)
        assert response.status_code == 200
        assert response.content == content
        assert response.headers["content-type"] == kind
        assert (
            response.headers["content-disposition"]
            == f"attachment; filename*=UTF-8''{quote(name, safe='')}"
        )
        assert response.headers["cache-control"] == "no-store"
        assert int(response.headers["content-length"]) == len(content)
        assert response.headers["x-content-type-options"] == "nosniff"
        assert ACCESS_COOKIE_NAME in response.cookies
        assert REFRESH_COOKIE_NAME in response.cookies
    service.get_link.assert_awaited_with("123")
    sigaa.classrooms.download_classroom_material.assert_awaited_with("AAA", POST_ID)
    assert sigaa.classrooms.download_classroom_material.await_count == 2


def test_sem_login_nao_consulta_nem_baixa(material_api):
    api, service, sigaa = material_api
    assert api.post(PATH).status_code == 401
    service.get_link.assert_not_awaited()
    sigaa.created.assert_not_called()


def test_turma_sem_acesso_nao_abre_cliente_de_download(material_api, cookies):
    api, service, sigaa = material_api
    api.cookies.update(cookies(refresh=CREDENTIALS))
    service.get_link.side_effect = ClassroomNotFound()
    assert api.post(PATH).status_code == 404
    sigaa.created.assert_not_called()
    sigaa.classrooms.download_classroom_material.assert_not_awaited()


@pytest.mark.parametrize(
    "error,status", [(MaterialNotFound(), 404), (SigaaParseError(), 502)]
)
def test_traduz_ausencia_e_falha_do_arquivo(material_api, cookies, error, status):
    api, _, sigaa = material_api
    api.cookies.update(cookies(refresh=CREDENTIALS))
    sigaa.classrooms.download_classroom_material.side_effect = error
    response = api.post(PATH)
    assert response.status_code == status
    assert "content-disposition" not in response.headers


def test_valida_id_do_material_na_fronteira(material_api, cookies, subtests):
    api, _, sigaa = material_api
    api.cookies.update(cookies(refresh=CREDENTIALS))
    for post_id in ("news:1", "material:abc", "topic:" + "a" * 64):
        with subtests.test(post_id=post_id):
            assert (
                api.post(f"/classrooms/123/posts/{post_id}/download").status_code == 422
            )
    sigaa.classrooms.download_classroom_material.assert_not_awaited()


def test_openapi_documenta_download_autenticado_com_tipo_variavel(api):
    path = "/classrooms/{classroom_id}/posts/{post_id}/download"
    methods = api.get("/openapi.json").json()["paths"][path]
    assert set(methods) == {"post"}
    assert {"200", "401", "404", "422", "502"} <= methods["post"]["responses"].keys()
    assert methods["post"]["responses"]["200"]["content"] == {
        "application/octet-stream": {"schema": {"type": "string", "format": "binary"}}
    }
