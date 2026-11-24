from sigaa_client import Credentials

from api.modules.oauth.clients import (
    CLIENT_ID_PREFIX,
    CLIENT_SECRET_PREFIX,
    MAX_CLIENTS_PER_USER,
)


def _logar(client, cookies, matricula="251000000"):
    client.cookies.clear()
    client.cookies.update(
        cookies(refresh=Credentials(registration=matricula, password="senha123"))
    )


def test_crud_completo_de_aplicacao_confidencial_e_publica(client, cookies):
    _logar(client, cookies)

    criado = client.post(
        "/oauth/clients",
        json={
            "name": "Meu Bot UnB",
            "description": "Notifica avisos no Telegram",
            "homepage_url": "https://bot.unb.dev",
            "confidential": True,
            "redirect_uris": ["https://bot.unb.dev/callback"],
        },
    )
    assert criado.status_code == 201
    dados = criado.json()
    assert dados["id"].startswith(CLIENT_ID_PREFIX)
    assert dados["client_secret"].startswith(CLIENT_SECRET_PREFIX)
    assert dados["confidential"] is True

    # GET nunca expõe client_secret
    listagem = client.get("/oauth/clients")
    assert listagem.status_code == 200
    assert len(listagem.json()) == 1
    assert "client_secret" not in listagem.json()[0]

    # Edição
    editado = client.patch(
        f"/oauth/clients/{dados['id']}",
        json={
            "name": "Bot UnB v2",
            "redirect_uris": [
                "https://bot.unb.dev/callback",
                "http://localhost:3000/callback",
            ],
        },
    )
    assert editado.status_code == 200
    assert editado.json()["name"] == "Bot UnB v2"
    assert len(editado.json()["redirect_uris"]) == 2

    # Rotação de segredo gera um novo valor distinto
    rotacionado = client.post(f"/oauth/clients/{dados['id']}/rotate-secret")
    assert rotacionado.status_code == 200
    assert rotacionado.json()["client_secret"].startswith(CLIENT_SECRET_PREFIX)
    assert rotacionado.json()["client_secret"] != dados["client_secret"]

    # Aplicação pública não recebe nem rotaciona segredo
    publico = client.post(
        "/oauth/clients",
        json={
            "name": "App Mobile",
            "confidential": False,
            "redirect_uris": ["meuapp://callback"],
        },
    )
    assert publico.status_code == 201
    assert publico.json()["client_secret"] is None
    assert (
        client.post(f"/oauth/clients/{publico.json()['id']}/rotate-secret").status_code
        == 422
    )


def test_isolamento_entre_donos_e_bloqueio_de_token_oauth(client, cookies, emitir):
    _logar(client, cookies, "251000000")
    app_id = client.post(
        "/oauth/clients",
        json={
            "name": "App A",
            "confidential": True,
            "redirect_uris": ["https://a.exemplo.com/cb"],
        },
    ).json()["id"]

    # Outro usuário não enxerga nem altera a aplicação
    _logar(client, cookies, "252000000")
    assert client.get("/oauth/clients").json() == []
    assert (
        client.patch(f"/oauth/clients/{app_id}", json={"name": "Outro"}).status_code
        == 404
    )
    assert client.post(f"/oauth/clients/{app_id}/rotate-secret").status_code == 404
    assert client.delete(f"/oauth/clients/{app_id}").status_code == 404

    # Token Bearer OAuth de terceiros é rejeitado (403)
    client.cookies.clear()
    token = emitir().access_token
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get("/oauth/clients", headers=headers).status_code == 403
    assert (
        client.post(
            "/oauth/clients",
            headers=headers,
            json={
                "name": "Invasor",
                "confidential": False,
                "redirect_uris": ["https://evil.exemplo.com/cb"],
            },
        ).status_code
        == 403
    )

    # Sem cookie nem token retorna 401
    assert client.get("/oauth/clients").status_code == 401


def test_limite_de_aplicacoes_por_conta(client, cookies):
    _logar(client, cookies)
    for i in range(MAX_CLIENTS_PER_USER):
        resp = client.post(
            "/oauth/clients",
            json={
                "name": f"App {i}",
                "confidential": False,
                "redirect_uris": [f"https://app{i}.exemplo.com/cb"],
            },
        )
        assert resp.status_code == 201

    excedente = client.post(
        "/oauth/clients",
        json={
            "name": "App extra",
            "confidential": False,
            "redirect_uris": ["https://extra.exemplo.com/cb"],
        },
    )
    assert excedente.status_code == 422


def test_excluir_aplicacao_revoga_tokens_em_cascata(
    client, cookies, emitir, stub_sigaa
):
    _logar(client, cookies)
    app_id = client.post(
        "/oauth/clients",
        json={
            "name": "App Temporário",
            "confidential": True,
            "redirect_uris": ["https://temp.exemplo.com/cb"],
        },
    ).json()["id"]

    par = emitir(client_id=app_id)
    assert (
        client.get(
            "/me", headers={"Authorization": f"Bearer {par.access_token}"}
        ).status_code
        == 200
    )

    assert client.delete(f"/oauth/clients/{app_id}").status_code == 204
    assert client.get("/oauth/clients").json() == []

    # Token emitido para a aplicação excluída para de funcionar imediatamente
    client.cookies.clear()
    assert (
        client.get(
            "/me", headers={"Authorization": f"Bearer {par.access_token}"}
        ).status_code
        == 401
    )
