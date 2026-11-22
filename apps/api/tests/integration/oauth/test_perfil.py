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


def test_perfil_oauth_seguido_de_web_busca_historico_apenas_na_sessao_web(
    client, emitir, cookies, stub_sigaa
):
    from sigaa_client import Credentials

    read = stub_sigaa.documents.get_completed_subjects
    grant = emitir()
    bearer = {"Authorization": f"Bearer {grant.access_token}"}
    assert client.get("/me", headers=bearer).status_code == 200
    read.assert_not_awaited()

    client.cookies.update(
        cookies(refresh=Credentials(registration="251000000", password="senha123"))
    )
    for _ in range(2):
        assert client.get("/me").status_code == 200
    read.assert_awaited_once_with("251000000")


def test_perfil_de_desempenho_consulta_indices_sem_carregar_componentes_cumpridos(
    client, emitir, stub_sigaa, monkeypatch
):
    from api.modules.me.transcript import TranscriptRepository

    completed = AsyncMock()
    monkeypatch.setattr(TranscriptRepository, "completed", completed)
    grant = emitir(Scope.CLASSROOMS, Scope.GRADES)
    response = client.get(
        "/me", headers={"Authorization": f"Bearer {grant.access_token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert set(data) == {"name", "registration", "photo", "course", "ira", "mp"}
    assert (data["ira"], data["mp"]) == (3.5, 4.0)
    completed.assert_not_awaited()
