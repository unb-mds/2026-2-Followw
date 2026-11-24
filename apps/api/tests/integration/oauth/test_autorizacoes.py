from sigaa_client import Credentials

from api.db.models import OAuthGrant
from api.modules.oauth.scopes import Scope


def _logar(client, cookies, matricula="251000000"):
    client.cookies.clear()
    client.cookies.update(
        cookies(refresh=Credentials(registration=matricula, password="senha123"))
    )


def test_lista_e_revoga_autorizacoes_do_estudante(client, cookies, emitir, stub_sigaa):
    _logar(client, cookies, "251000000")
    app_id = client.post(
        "/oauth/clients",
        json={
            "name": "Planejador UnB",
            "description": "Ajuda a montar a grade",
            "homepage_url": "https://planejador.unb.dev",
            "confidential": True,
            "redirect_uris": ["https://planejador.unb.dev/cb"],
        },
    ).json()["client_id"]

    par = emitir(Scope.CLASSROOMS, client_id=app_id)

    grants = client.get("/oauth/grants")
    assert grants.status_code == 200
    itens = grants.json()
    assert len(itens) == 1
    assert itens[0]["id"] == str(par.grant_id)
    assert itens[0]["client_id"] == app_id
    assert itens[0]["client_name"] == "Planejador UnB"
    assert itens[0]["client_homepage_url"] == "https://planejador.unb.dev"
    assert set(itens[0]["scopes"]) == {"profile:read", "classrooms:read"}

    # Outro usuário não consegue revogar
    _logar(client, cookies, "252000000")
    assert client.get("/oauth/grants").json() == []
    assert client.delete(f"/oauth/grants/{par.grant_id}").status_code == 404

    # Token Bearer não pode listar nem revogar grants
    client.cookies.clear()
    headers = {"Authorization": f"Bearer {par.access_token}"}
    assert client.get("/oauth/grants", headers=headers).status_code == 403
    assert (
        client.delete(f"/oauth/grants/{par.grant_id}", headers=headers).status_code
        == 403
    )

    # Dono revoga e o token deixa de valer imediatamente
    _logar(client, cookies, "251000000")
    assert client.delete(f"/oauth/grants/{par.grant_id}").status_code == 204
    assert client.get("/oauth/grants").json() == []

    client.cookies.clear()
    assert client.get("/me", headers=headers).status_code == 401


def test_listagem_de_grants_ignora_escopo_desconhecido_sem_erro_500(
    client, cookies, emitir, database
):
    _logar(client, cookies, "251000000")
    par = emitir(Scope.CLASSROOMS)
    with database.begin() as session:
        grant = session.get(OAuthGrant, par.grant_id)
        grant.scopes = ["profile:read", "escopo:removido", "classrooms:read"]

    resposta = client.get("/oauth/grants")
    assert resposta.status_code == 200
    assert set(resposta.json()[0]["scopes"]) == {"profile:read", "classrooms:read"}
