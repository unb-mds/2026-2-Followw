from urllib.parse import parse_qs, urlsplit
from uuid import uuid7

from .helpers import APPLICATIONS, AUTHORIZE, authorization_query


def test_exibe_escopos_e_recusa_preservando_estado_e_query(
    client, sessao_web, criar_aplicacao
):
    user = sessao_web("251000001")
    app = criar_aplicacao()
    query = authorization_query(app)
    response = client.get(AUTHORIZE, params=query, headers=user)
    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "no-store"
    consent = response.json()
    assert consent["name"] == app["name"]
    assert consent["client_id"] == app["client_id"]
    permissions = {item["scope"]: item for item in consent["permissions"]}
    assert set(permissions) == {
        "classrooms:read",
        "classrooms.frequency:read",
        "profile:read",
    }
    assert permissions["classrooms.frequency:read"]["requires"] == "classrooms:read"
    result = client.post(
        AUTHORIZE,
        json={"request_token": consent["request_token"], "approved": False},
        headers=user,
    )
    assert result.status_code == 200
    redirect = urlsplit(result.json()["redirect_uri"])
    assert (redirect.scheme, redirect.netloc, redirect.path) == (
        "https",
        "app.example",
        "/callback",
    )
    assert parse_qs(redirect.query) == {
        "return": ["agenda"],
        "error": ["access_denied"],
        "state": [query["state"]],
    }


def test_recusa_escopo_uri_ou_aplicacao_invalidos_sem_redirecionar(
    client, sessao_web, criar_aplicacao, subtests
):
    app = criar_aplicacao()
    query = authorization_query(app)
    user = sessao_web("251000001")
    for change, error in (
        ({"client_id": str(uuid7())}, "invalid_client"),
        ({"client_id": app["client_id"].replace("-", "")}, "invalid_client"),
        ({"redirect_uri": query["redirect_uri"] + "&extra=1"}, "invalid_request"),
        ({"scope": "inexistente:read"}, "invalid_scope"),
        ({"scope": "classrooms.frequency:write"}, "invalid_scope"),
        ({"code_challenge_method": "plain"}, "invalid_request"),
    ):
        with subtests.test(change=change):
            response = client.get(AUTHORIZE, params={**query, **change}, headers=user)
            assert response.status_code == 400
            assert response.json() == {"error": error}
            assert "Location" not in response.headers


def test_decisao_exige_a_mesma_sessao_e_uri_ainda_cadastrada(
    client, sessao_web, criar_aplicacao
):
    owner = sessao_web()
    user = sessao_web("251000001")
    app = criar_aplicacao(owner=owner)
    response = client.get(AUTHORIZE, params=authorization_query(app), headers=user)
    decision = {"request_token": response.json()["request_token"], "approved": True}
    assert client.post(AUTHORIZE, json=decision).status_code == 401
    other_session = sessao_web("251000001")
    assert client.post(AUTHORIZE, json=decision, headers=other_session).json() == {
        "error": "invalid_request"
    }
    response = client.patch(
        f"{APPLICATIONS}/{app['client_id']}",
        json={"redirect_uris": ["https://app.example/nova"]},
        headers=owner,
    )
    assert response.status_code == 200
    assert client.post(AUTHORIZE, json=decision, headers=user).json() == {
        "error": "invalid_request"
    }
