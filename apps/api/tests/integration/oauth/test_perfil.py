from unittest.mock import AsyncMock

from api.modules.oauth.scopes import Scope


def test_edicao_com_bearer_reaproveita_o_sigaa_e_filtra_perfil_retornado(
    client, emitir, stub_sigaa
):
    stub_sigaa.profile.update_profile = AsyncMock(
        return_value=stub_sigaa.profile.get_profile.return_value
    )

    def editar(token):
        return client.patch(
            "/me/profile",
            data={"photo_action": "keep", "bio": "Minha bio"},
            headers={"Authorization": f"Bearer {token}"},
        )

    assert editar(emitir().access_token).status_code == 403
    stub_sigaa.profile.update_profile.assert_not_awaited()
    response = editar(emitir(Scope.PROFILE_WRITE).access_token)
    assert response.status_code == 200
    assert set(response.json()) == {"name", "registration", "course", "photo"}
    assert not response.cookies
    stub_sigaa.profile.update_profile.assert_awaited_once_with(
        password="senha123", bio="Minha bio", photo=None, remove_photo=False
    )
