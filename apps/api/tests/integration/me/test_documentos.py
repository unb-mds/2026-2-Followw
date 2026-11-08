import httpx
import pytest
from sigaa_client import (
    AuthenticationFailed,
    DocumentUnavailable,
    MissingProfilePhoto,
    SessionExpired,
    SigaaParseError,
)

from api.cookies import (
    ACCESS_COOKIE_NAME,
    REFRESH_COOKIE_NAME,
)
from api.db.main import get_sessionmaker

from .helpers import (
    _SEM_FOTO,
    CREDENCIAIS,
    DOCUMENT_DOWNLOADS,
)


@pytest.mark.parametrize(
    "path,method,filename",
    [
        ("student-card", "get_student_card_pdf", "carteirinha.pdf"),
        ("transcript", "get_transcript_pdf", "historico.pdf"),
    ],
)
def test_download_documento_preserva_conteudo_cookies_e_nao_usa_cache(
    client, cookies, documents, qstash, path, method, filename
):
    def banco_proibido():
        pytest.fail("Download de documento não deve usar banco")

    client.app.dependency_overrides[get_sessionmaker] = banco_proibido
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    for _ in range(2):
        response = client.post(f"/me/{path}")
        assert response.status_code == 200
        assert response.content == getattr(documents, method).return_value
        assert response.headers["content-type"] == "application/pdf"
        assert (
            response.headers["content-disposition"]
            == f'attachment; filename="{filename}"'
        )
        assert response.headers["cache-control"] == "no-store"
        assert int(response.headers["content-length"]) == len(response.content)
        assert ACCESS_COOKIE_NAME in response.cookies
        assert REFRESH_COOKIE_NAME in response.cookies
    assert getattr(documents, method).await_count == 2
    assert qstash.published == []


@pytest.mark.parametrize("path,method", DOCUMENT_DOWNLOADS)
def test_download_documento_exige_login(client, stub_sigaa, documents, path, method):
    assert client.post(f"/me/{path}").status_code == 401
    getattr(documents, method).assert_not_awaited()
    stub_sigaa.created.assert_not_called()


@pytest.mark.parametrize(
    "error,status",
    [
        (AuthenticationFailed(), 401),
        (SessionExpired(), 502),
        (SigaaParseError("PDF inválido"), 502),
        (httpx.ReadTimeout("fora"), 502),
    ],
)
@pytest.mark.parametrize("path,method", DOCUMENT_DOWNLOADS)
def test_download_documento_traduz_erros(
    client, cookies, documents, error, status, path, method
):
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    getattr(documents, method).side_effect = error
    assert client.post(f"/me/{path}").status_code == status


@pytest.mark.parametrize("path,method", DOCUMENT_DOWNLOADS)
def test_download_recusado_pelo_sigaa_retorna_422_com_motivo(
    client, cookies, documents, path, method
):
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    getattr(documents, method).side_effect = DocumentUnavailable("Motivo do SIGAA")
    response = client.post(f"/me/{path}")
    assert response.status_code == 422
    assert response.json() == {
        "detail": "Não foi possível emitir o documento: Motivo do SIGAA"
    }


def test_carteirinha_sem_foto_explica_o_motivo(client, cookies, documents, restaurant):
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    error = MissingProfilePhoto("Discente não possui foto")
    documents.get_student_card_pdf.side_effect = error
    restaurant.get_restaurant_credentials.side_effect = error
    for response in (client.post("/me/student-card"), client.get("/me/ru-token")):
        assert response.status_code == 422
        assert response.json() == {"detail": _SEM_FOTO}


@pytest.mark.parametrize("path", ["student-card", "transcript"])
def test_openapi_documenta_download_documento(client, path):
    methods = client.get("/openapi.json").json()["paths"][f"/me/{path}"]
    assert "get" not in methods
    route = methods["post"]
    assert route["tags"] == ["Me"]
    assert {"401", "422", "502"} <= route["responses"].keys()
    assert route["responses"]["200"]["content"] == {
        "application/pdf": {"schema": {"type": "string", "format": "binary"}}
    }


@pytest.mark.parametrize("path,method", DOCUMENT_DOWNLOADS)
def test_download_documento_rejeita_get(client, documents, path, method):
    assert client.get(f"/me/{path}").status_code == 405
    getattr(documents, method).assert_not_awaited()
