from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from hashlib import sha256

from api.db.models import OAuthAuthorizationCode

from .helpers import APPLICATIONS, TOKEN, approve, exchange_form


def test_codigo_emite_tokens_para_os_escopos_e_so_pode_ser_trocado_uma_vez(
    client, sessao_web, criar_aplicacao, sigaa
):
    app = criar_aplicacao()
    code = approve(client, sessao_web(), app)
    auth = (app["client_id"], app["client_secret"])

    def exchange(_):
        return client.post(TOKEN, data=exchange_form(code), auth=auth)

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = sorted(executor.map(exchange, range(2)), key=lambda r: r.status_code)
    good, replay = results
    assert (good.status_code, replay.status_code) == (200, 400)
    assert replay.json() == {"error": "invalid_grant"}
    assert good.headers["Cache-Control"] == "no-store"
    tokens = good.json()
    assert tokens["refresh_token"]
    assert tokens["token_type"] == "Bearer"
    assert set(tokens["scope"].split()) == {
        "classrooms:read",
        "classrooms.frequency:read",
        "profile:read",
    }
    assert (
        client.get(
            "/me", headers={"Authorization": f"Bearer {tokens['access_token']}"}
        ).status_code
        == 200
    )
    assert (
        client.get(
            "/me/ru-statement",
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        ).status_code
        == 403
    )


def test_codigo_exige_cliente_segredo_verificador_e_uri_corretos(
    client, sessao_web, criar_aplicacao, subtests
):
    app = criar_aplicacao()
    other = criar_aplicacao()
    code = approve(client, sessao_web(), app)
    form = {
        **exchange_form(code),
        "client_id": app["client_id"],
        "client_secret": app["client_secret"],
    }
    for change, status, error in (
        ({"client_secret": ""}, 401, "invalid_client"),
        ({"client_secret": "outro"}, 401, "invalid_client"),
        ({"client_id": app["client_id"].replace("-", "")}, 401, "invalid_client"),
        (
            {"client_id": other["client_id"], "client_secret": other["client_secret"]},
            400,
            "invalid_grant",
        ),
        ({"redirect_uri": "https://app.example/callback"}, 400, "invalid_grant"),
        ({"code_verifier": "b" * 43}, 400, "invalid_grant"),
    ):
        with subtests.test(fields=tuple(change)):
            response = client.post(TOKEN, data={**form, **change})
            assert response.status_code == status
            assert response.json() == {"error": error}
            assert app["client_secret"] not in response.text
            assert code not in response.text
    assert client.post(TOKEN, data=form).status_code == 200


def test_codigo_expirado_ou_com_uri_removida_nao_emite_tokens(
    client, database, sessao_web, criar_aplicacao
):
    owner = sessao_web()
    app = criar_aplicacao(owner=owner)
    expired = approve(client, sessao_web(), app)
    code = approve(client, sessao_web(), app)
    with database.begin() as session:
        row = session.get(OAuthAuthorizationCode, sha256(expired.encode()).digest())
        row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    auth = (app["client_id"], app["client_secret"])
    expired_response = client.post(TOKEN, data=exchange_form(expired), auth=auth)
    assert expired_response.json() == {"error": "invalid_grant"}
    assert (
        client.patch(
            f"{APPLICATIONS}/{app['client_id']}",
            json={"redirect_uris": ["http://127.0.0.1:4576/callback"]},
            headers=owner,
        ).status_code
        == 200
    )
    assert client.post(TOKEN, data=exchange_form(code), auth=auth).json() == {
        "error": "invalid_grant"
    }


def test_rotacao_exige_o_segredo_novo_no_refresh_e_remocao_revoga_os_tokens(
    client, sessao_web, criar_aplicacao, sigaa
):
    owner = sessao_web()
    app = criar_aplicacao(owner=owner)
    code = approve(client, sessao_web(), app)
    old_auth = (app["client_id"], app["client_secret"])
    tokens = client.post(TOKEN, data=exchange_form(code), auth=old_auth).json()
    path = f"{APPLICATIONS}/{app['client_id']}"
    secret = client.post(f"{path}/rotate-secret", headers=owner).json()["client_secret"]
    body = {"grant_type": "refresh_token", "refresh_token": tokens["refresh_token"]}
    assert client.post(TOKEN, data=body, auth=old_auth).json() == {
        "error": "invalid_client"
    }
    new_auth = (app["client_id"], secret)
    renewed = client.post(TOKEN, data=body, auth=new_auth)
    assert renewed.status_code == 200
    bearer = {"Authorization": f"Bearer {renewed.json()['access_token']}"}
    assert client.get("/me", headers=bearer).status_code == 200
    assert client.delete(path, headers=owner).status_code == 204
    assert client.get("/me", headers=bearer).status_code == 401
    assert client.post(TOKEN, data=body, auth=new_auth).json() == {
        "error": "invalid_client"
    }


def test_erro_de_formulario_oauth_nao_expoe_segredos(api):
    result = api.post(TOKEN, data={"client_secret": "privado", "code": "temporario"})
    assert result.status_code == 400
    assert result.json() == {"error": "invalid_request"}
