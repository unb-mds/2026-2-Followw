from pydantic import SecretStr
from sigaa_client import (
    Credentials,
)

from api.modules.me.repository import UserRepository

from .helpers import (
    CREDENCIAIS,
)


def test_configuracoes_aceitam_display_name_no_limite(client, cookies):
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    nome = "a" * 24

    response = client.patch("/me/settings", json={"displayName": nome})

    assert response.status_code == 200
    assert response.json() == {"displayName": nome}
    assert client.get("/me/settings").json() == response.json()


def test_configuracoes_de_outra_conta_nao_sao_lidas_nem_alteradas(client, cookies):
    outra = Credentials(registration="251000001", password=SecretStr("senha123"))
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    assert client.patch("/me/settings", json={"displayName": "Ana"}).status_code == 200

    client.cookies.clear()
    client.cookies.update(cookies(refresh=outra))
    assert client.get("/me/settings").json() == {"displayName": None}
    assert client.patch("/me/settings", json={"displayName": "Bia"}).status_code == 200
    assert client.get("/me/settings").json() == {"displayName": "Bia"}

    client.cookies.clear()
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    assert client.get("/me/settings").json() == {"displayName": "Ana"}


def test_patch_sem_campos_preserva_as_configuracoes(client, cookies):
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    client.patch("/me/settings", json={"displayName": "Ana"})

    response = client.patch("/me/settings", json={})

    assert response.json() == {"displayName": "Ana"}


def test_configuracoes_rejeitam_input_invalido(client, cookies, subtests):
    for body in [
        {"displayName": "a" * 25},
        {"displayName": ""},
        {"displayName": "   "},
        # A setting saiu: quem ainda a mandar recebe 422.
        {"defaultRuCampus": "Gama"},
        {"theme": "dark"},
    ]:
        with subtests.test(body=body):
            client.cookies.update(cookies(refresh=CREDENCIAIS))

            response = client.patch("/me/settings", json=body)

            assert response.status_code == 422
            assert client.get("/me/settings").json() == {"displayName": None}


def test_configuracoes_removem_espacos_do_display_name(client, cookies):
    client.cookies.update(cookies(refresh=CREDENCIAIS))

    response = client.patch("/me/settings", json={"displayName": "  Ana  "})

    assert response.json()["displayName"] == "Ana"


def test_configuracoes_sobrevivem_ao_sync_criando_o_usuario_ao_mesmo_tempo(
    client, cookies, monkeypatch
):
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    client.patch("/me/settings", json={"displayName": "Ana"})
    original = UserRepository.get_by_registration
    calls = 0

    # Simula o sync do perfil gravando o usuário entre a leitura e o insert.
    async def get_by_registration(self, registration):
        nonlocal calls
        calls += 1
        return None if calls == 1 else await original(self, registration)

    monkeypatch.setattr(UserRepository, "get_by_registration", get_by_registration)

    response = client.patch("/me/settings", json={"displayName": "Bia"})

    assert response.status_code == 200
    assert response.json() == {"displayName": "Bia"}


async def test_settings_retorna_vazio_quando_usuario_nao_tem_configuracoes(
    async_database,
):
    async with async_database() as session:
        settings = await UserRepository(session).get_settings("251000000")
        assert settings == {}


async def test_settings_salva_e_sobrescreve_preferencias(async_database):
    async with async_database() as session:
        repo = UserRepository(session)
        updated = await repo.update_settings(
            "251000000", {"displayName": "Discente Teste"}
        )
        assert updated == {"displayName": "Discente Teste"}
        await session.commit()

    async with async_database() as session:
        repo = UserRepository(session)
        updated = await repo.update_settings("251000000", {"displayName": "Outro"})
        assert updated == {"displayName": "Outro"}
        await session.commit()

    async with async_database() as session:
        repo = UserRepository(session)
        settings = await repo.get_settings("251000000")
        assert settings == {"displayName": "Outro"}
