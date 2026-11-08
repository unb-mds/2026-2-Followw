from io import BytesIO
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from PIL import Image

from api.db.main import get_database
from api.modules.me.photo import MAX_PHOTO_BYTES, normalize_photo
from api.modules.me.router import router
from api.modules.me.upload_guard import ProfileUploadGuard
from api.sigaa import get_sigaa_connection


def test_normaliza_foto_e_remove_metadados():
    output = BytesIO()
    source = Image.new("RGB", (100, 100))
    exif = Image.Exif()
    exif[270] = "dados privados"
    source.save(output, format="JPEG", exif=exif)
    with Image.open(BytesIO(normalize_photo(output.getvalue()))) as image:
        assert image.size == (800, 1000)
        assert not image.getexif()


@pytest.mark.parametrize(
    "content", [b"<svg></svg>", b"foto falsa", b"\x89PNG\r\n\x1a\n"]
)
def test_recusa_arquivo_invalido(content):
    with pytest.raises(HTTPException) as error:
        normalize_photo(content)
    assert error.value.status_code == 422


def test_limite_da_foto_e_inclusivo():
    output = BytesIO()
    Image.new("RGB", (20, 20)).save(output, format="PNG")
    photo = output.getvalue().ljust(MAX_PHOTO_BYTES, b"\0")
    assert normalize_photo(photo).startswith(b"\xff\xd8")
    with pytest.raises(HTTPException) as error:
        normalize_photo(photo + b"\0")
    assert error.value.status_code == 413


@pytest.mark.parametrize("origin", [None, "https://malicioso.test", "null"])
def test_multipart_recusa_origem_invalida_antes_de_autenticar(origin):
    app = FastAPI()
    app.include_router(router, prefix="/me")
    app.add_middleware(ProfileUploadGuard)
    headers = {"origin": origin} if origin else {}
    response = TestClient(app).patch(
        "/me/profile", data={"bio": "teste", "photo_action": "keep"}, headers=headers
    )
    assert response.status_code == 403


@pytest.mark.parametrize(
    "data",
    [
        {"bio": "teste", "photo_action": "invalid"},
        {"bio": "teste", "photo_action": "remove"},
        {"bio": "a" * 1025, "photo_action": "keep"},
        {"bio": "😀" * 1025, "photo_action": "keep"},
    ],
)
def test_formulario_valida_acao_e_bio_sem_acessar_sigaa(monkeypatch, data):
    app = FastAPI()
    app.include_router(router, prefix="/me")
    app.dependency_overrides[get_sigaa_connection] = lambda: object()
    app.dependency_overrides[get_database] = lambda: object()
    edit = AsyncMock()
    monkeypatch.setattr("api.modules.me.router.edit_profile", edit)
    response = TestClient(app).patch(
        "/me/profile",
        data=data,
        headers={"origin": "https://followw.app"},
    )
    assert response.status_code == 422
    edit.assert_not_called()


@pytest.mark.parametrize(
    ("data", "expected_bio"),
    [
        ({"photo_action": "remove"}, None),
        ({"photo_action": "keep", "bio": ""}, ""),
        ({"photo_action": "keep", "bio": "a\r\n" * 512}, "a\n" * 512),
        ({"photo_action": "keep", "bio": "😀" * 1024}, "😀" * 1024),
    ],
)
def test_distingue_bio_ausente_de_bio_vazia(monkeypatch, data, expected_bio):
    from types import SimpleNamespace

    from api.modules.me.profile import UserProfile

    app = FastAPI()
    app.include_router(router, prefix="/me")
    account = SimpleNamespace(registration="conta-autenticada")
    app.dependency_overrides[get_sigaa_connection] = lambda: account
    db = object()
    app.dependency_overrides[get_database] = lambda: db
    profile = UserProfile(
        name="Teste",
        registration="conta-autenticada",
        photo=None,
        bio=None,
        unit=None,
        course=None,
        entry_semester=None,
        integralization=None,
        workload=None,
        period_max_workload=None,
        ira=None,
        mp=None,
        level="Graduação",
    )
    edit = AsyncMock(return_value=profile)
    monkeypatch.setattr("api.modules.me.router.edit_profile", edit)
    response = TestClient(app).patch(
        "/me/profile",
        data=data,
        headers={"origin": "https://followw.app"},
    )
    assert response.status_code == 200
    assert edit.await_args.args == (account, db)
    assert edit.await_args.kwargs == {
        "bio": expected_bio,
        "photo": None,
        "remove_photo": data["photo_action"] == "remove",
    }


@pytest.mark.parametrize("extra_field", ["photo", "other"])
def test_recusa_segundo_arquivo_antes_de_editar(monkeypatch, extra_field):
    from types import SimpleNamespace

    app = FastAPI()
    app.include_router(router, prefix="/me")
    app.dependency_overrides[get_sigaa_connection] = lambda: SimpleNamespace(
        registration="conta-autenticada"
    )
    app.dependency_overrides[get_database] = lambda: object()
    edit = AsyncMock()
    monkeypatch.setattr("api.modules.me.router.edit_profile", edit)
    output = BytesIO()
    Image.new("RGB", (20, 20)).save(output, format="PNG")
    image = ("foto.png", output.getvalue(), "image/png")
    response = TestClient(app).patch(
        "/me/profile",
        data={"photo_action": "replace"},
        files=[(extra_field, image), ("photo", image)],
        headers={"origin": "https://followw.app"},
    )
    assert response.status_code == 422
    edit.assert_not_awaited()


def test_upload_excessivo_e_recusado_antes_do_parser():
    app = FastAPI()
    app.include_router(router, prefix="/me")
    app.add_middleware(ProfileUploadGuard)
    response = TestClient(app).patch(
        "/me/profile",
        content=b"x" * (4 * 1024 * 1024 + 64 * 1024 + 1),
        headers={"origin": "https://followw.app"},
    )
    assert response.status_code == 413


def test_sem_sessao_nao_edita_perfil():
    app = FastAPI()
    app.include_router(router, prefix="/me")
    response = TestClient(app).patch(
        "/me/profile",
        data={"bio": "teste", "photo_action": "keep"},
        headers={"origin": "https://followw.app"},
    )
    assert response.status_code == 401


def test_edicao_grava_cache_remove_foto_e_preserva_nome_local(
    client, cookies, stub_sigaa
):
    from sigaa_client import Credentials

    credentials = Credentials(registration="251000000", password="senha-teste")
    client.cookies.update(cookies(access="tok", refresh=credentials))
    visible_bio = "a\n" * 512
    original = stub_sigaa.profile.get_profile.return_value.model_copy(
        update={
            "photo": "https://arquivos.unb.br/antiga.jpg",
            "bio": "a\r\n" * 512 + "fim",
        }
    )
    stub_sigaa.profile.get_profile.return_value = original
    assert client.get("/me").status_code == 200
    assert (
        client.patch("/me/settings", json={"displayName": "Nome local"}).status_code
        == 200
    )
    updated = original.model_copy(update={"photo": None})
    stub_sigaa.profile.update_profile = AsyncMock(return_value=updated)
    response = client.patch(
        "/me/profile",
        data={"photo_action": "remove"},
        headers={"origin": "https://followw.app"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["photo"] is None
    assert response.json()["bio"] == visible_bio
    stub_sigaa.profile.update_profile.assert_awaited_once_with(
        password="senha-teste", bio=None, photo=None, remove_photo=True
    )
    assert client.get("/me").json()["bio"] == visible_bio
    assert client.get("/me").json()["photo"] is None
    assert client.get("/me/settings").json()["displayName"] == "Nome local"
    stub_sigaa.logout.assert_awaited()


async def test_sync_antigo_nao_sobrescreve_edicao_recente(async_database, stub_sigaa):
    from datetime import UTC, datetime, timedelta

    from api.modules.me.repository import UserRepository

    now = datetime.now(UTC)
    profile = stub_sigaa.profile.get_profile.return_value
    async with async_database() as session:
        repo = UserRepository(session)
        await repo.save_profile(
            profile.model_copy(
                update={
                    "bio": "Bio editada",
                    "photo": "https://arquivos.unb.br/nova.jpg",
                }
            ),
            now,
            replace_photo=True,
        )
        await session.commit()
        await repo.save_profile(
            profile.model_copy(update={"bio": "Bio antiga", "photo": None}),
            now - timedelta(seconds=10),
            replace_photo=True,
        )
        await session.commit()
    async with async_database() as session:
        user = await UserRepository(session).get_by_registration(profile.registration)
        assert user.bio == "Bio editada"
        assert user.photo == "https://arquivos.unb.br/nova.jpg"
