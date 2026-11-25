import asyncio
import base64

from fastapi import HTTPException
from sigaa_client import Credentials

from api.modules.oauth.clients import (
    CLIENT_ID_PREFIX,
    CLIENT_SECRET_PREFIX,
    MAX_CLIENTS_PER_USER,
    OAuthClientCreate,
    create_client,
    resolve_user_id,
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
    assert dados["client_id"].startswith(CLIENT_ID_PREFIX)
    assert dados["client_secret"].startswith(CLIENT_SECRET_PREFIX)
    assert dados["confidential"] is True

    # GET nunca expõe client_secret
    listagem = client.get("/oauth/clients")
    assert listagem.status_code == 200
    assert len(listagem.json()) == 1
    assert "client_secret" not in listagem.json()[0]

    # Edição
    editado = client.patch(
        f"/oauth/clients/{dados['client_id']}",
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
    rotacionado = client.post(f"/oauth/clients/{dados['client_id']}/rotate-secret")
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
        client.post(
            f"/oauth/clients/{publico.json()['client_id']}/rotate-secret"
        ).status_code
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
    ).json()["client_id"]

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


def test_limite_de_aplicacoes_resiste_a_criacao_concorrente(db):
    async def disparar():
        owner_id = await resolve_user_id(db, "251000000")
        body = OAuthClientCreate(
            name="App concorrente",
            confidential=False,
            redirect_uris=["https://concorrente.exemplo.com/cb"],
        )
        return await asyncio.gather(
            *(
                create_client(db, owner_id, body)
                for _ in range(MAX_CLIENTS_PER_USER + 5)
            ),
            return_exceptions=True,
        )

    resultados = asyncio.run(disparar())
    criados = [r for r in resultados if not isinstance(r, BaseException)]
    recusados = [
        r for r in resultados if isinstance(r, HTTPException) and r.status_code == 422
    ]
    assert len(criados) == MAX_CLIENTS_PER_USER
    assert len(recusados) == 5


def test_excluir_aplicacao_revoga_tokens_em_cascata(
    client, cookies, emitir, stub_sigaa
):
    _logar(client, cookies)
    criado = client.post(
        "/oauth/clients",
        json={
            "name": "App Temporário",
            "confidential": True,
            "redirect_uris": ["https://temp.exemplo.com/cb"],
        },
    ).json()
    app_id = criado["client_id"]
    segredo = criado["client_secret"]

    par = emitir(client_id=app_id)
    assert (
        client.get(
            "/me", headers={"Authorization": f"Bearer {par.access_token}"}
        ).status_code
        == 200
    )

    assert client.delete(f"/oauth/clients/{app_id}").status_code == 204
    assert client.get("/oauth/clients").json() == []

    # Token emitido e refresh para a aplicação excluída param de funcionar imediatamente
    client.cookies.clear()
    assert (
        client.get(
            "/me", headers={"Authorization": f"Bearer {par.access_token}"}
        ).status_code
        == 401
    )
    renovacao = client.post(
        "/oauth/token",
        data={
            "grant_type": "refresh_token",
            "client_id": app_id,
            "client_secret": segredo,
            "refresh_token": par.refresh_token,
        },
    )
    assert renovacao.status_code == 401
    assert renovacao.json() == {"error": "invalid_client"}


def test_oauth_token_valida_registro_e_rotacao_de_client_secret(
    client, cookies, emitir, sigaa
):
    _logar(client, cookies)
    criado = client.post(
        "/oauth/clients",
        json={
            "name": "Backend UnB",
            "confidential": True,
            "redirect_uris": ["https://backend.exemplo.com/cb"],
        },
    ).json()
    app_id = criado["client_id"]
    segredo_antigo = criado["client_secret"]
    par = emitir(client_id=app_id)

    client.cookies.clear()

    # client_id não registrado é rejeitado
    inexistente = client.post(
        "/oauth/token",
        data={
            "grant_type": "refresh_token",
            "client_id": "flw_app_nao_existe",
            "client_secret": segredo_antigo,
            "refresh_token": par.refresh_token,
        },
    )
    assert inexistente.status_code == 401
    assert inexistente.json() == {"error": "invalid_client"}

    # Segredo errado ou ausente é rejeitado
    assert (
        client.post(
            "/oauth/token",
            data={
                "grant_type": "refresh_token",
                "client_id": app_id,
                "client_secret": "flw_sec_errado",
                "refresh_token": par.refresh_token,
            },
        ).status_code
        == 401
    )

    # Sem segredo nem DPoP, o erro é da autenticação do cliente
    sem_segredo = client.post(
        "/oauth/token",
        data={
            "grant_type": "refresh_token",
            "client_id": app_id,
            "refresh_token": par.refresh_token,
        },
    )
    assert sem_segredo.status_code == 401
    assert sem_segredo.json() == {"error": "invalid_client"}

    # Segredo válido via formulário funciona
    ok_form = client.post(
        "/oauth/token",
        data={
            "grant_type": "refresh_token",
            "client_id": app_id,
            "client_secret": segredo_antigo,
            "refresh_token": par.refresh_token,
        },
    )
    assert ok_form.status_code == 200
    assert ok_form.json()["access_token"]

    # Rotaciona o segredo
    _logar(client, cookies)
    novo_segredo = client.post(f"/oauth/clients/{app_id}/rotate-secret").json()[
        "client_secret"
    ]
    client.cookies.clear()

    # Segredo antigo para de funcionar imediatamente
    antigo_bloqueado = client.post(
        "/oauth/token",
        data={
            "grant_type": "refresh_token",
            "client_id": app_id,
            "client_secret": segredo_antigo,
            "refresh_token": par.refresh_token,
        },
    )
    assert antigo_bloqueado.status_code == 401
    assert antigo_bloqueado.json() == {"error": "invalid_client"}

    # Novo segredo funciona via HTTP Basic (RFC 6749)
    basic = base64.b64encode(f"{app_id}:{novo_segredo}".encode()).decode()
    ok_basic = client.post(
        "/oauth/token",
        data={"grant_type": "refresh_token", "refresh_token": par.refresh_token},
        headers={"Authorization": f"Basic {basic}"},
    )
    assert ok_basic.status_code == 200
    assert ok_basic.json()["access_token"]
