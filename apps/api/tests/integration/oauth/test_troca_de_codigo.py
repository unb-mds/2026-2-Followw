import asyncio
from urllib.parse import parse_qs, urlsplit
from uuid import UUID

import pytest
from joserfc.errors import JoseError
from joserfc.jwk import OctKey

from api.core.config import settings
from api.crypto import decrypt_claims, derive_secret
from api.db.models import OAuthAuthorizationCode


@pytest.fixture
def troca(client, autorizacao):
    app, params, verifier = autorizacao
    token = client.get("/oauth/authorize", params=params).json()["request_token"]
    resposta = client.post(
        "/oauth/authorize", json={"request_token": token, "approved": True}
    )
    code = parse_qs(urlsplit(resposta.json()["redirect_uri"]).query)["code"][0]
    return {
        "grant_type": "authorization_code",
        "client_id": app["client_id"],
        "client_secret": app["client_secret"],
        "redirect_uri": params["redirect_uri"],
        "code": code,
        "code_verifier": verifier,
    }


def test_troca_codigo_uma_vez_e_permite_revogacao(client, troca):
    resposta = client.post("/oauth/token", data=troca)
    assert resposta.status_code == 200, resposta.text
    assert resposta.json()["refresh_token"]
    assert client.post("/oauth/token", data=troca).json() == {"error": "invalid_grant"}
    grant = client.get("/oauth/grants").json()[0]
    assert client.delete(f"/oauth/grants/{grant['id']}").status_code == 204
    assert (
        client.get(
            "/me",
            headers={"Authorization": f"Bearer {resposta.json()['access_token']}"},
        ).status_code
        == 401
    )


@pytest.mark.parametrize(
    "campo,valor",
    [("code_verifier", "x" * 43), ("redirect_uri", "https://intruso.test")],
)
def test_troca_invalida_nao_consume_codigo(client, troca, campo, valor):
    assert client.post("/oauth/token", data=troca | {campo: valor}).status_code == 400
    assert client.post("/oauth/token", data=troca).status_code == 200


def test_codigo_exige_salt_do_banco_para_decifrar(db, troca):
    record_id, encrypted = troca["code"].split(".", 1)
    key = OctKey.import_key(
        derive_secret(settings.oauth_secret_key, f"followw:oauth:code:{record_id}")
    )
    with pytest.raises(JoseError):
        decrypt_claims(encrypted, key)
    record = asyncio.run(
        db.read(lambda session: session.get(OAuthAuthorizationCode, UUID(record_id)))
    )
    assert len(record.salt) == 32
    assert not hasattr(record, "password")


def test_codigo_expirado_nao_emite_tokens(client, troca, database):
    from datetime import UTC, datetime, timedelta

    with database.begin() as session:
        session.get(
            OAuthAuthorizationCode, UUID(troca["code"].split(".")[0])
        ).expires_at = datetime.now(UTC) - timedelta(seconds=1)
    assert client.post("/oauth/token", data=troca).json() == {"error": "invalid_grant"}


def test_troca_publica_exige_dpop_e_vincula_refresh_a_chave(client, autorizacao):
    import time
    from uuid import uuid4

    from joserfc import jwt
    from joserfc.jwk import ECKey

    _, params, verifier = autorizacao
    app = client.post(
        "/oauth/clients",
        json={"name": "Mobile", "redirect_uris": ["mobile://callback"]},
    ).json()
    params |= {"client_id": app["client_id"], "redirect_uri": "mobile://callback"}
    token = client.get("/oauth/authorize", params=params).json()["request_token"]
    redirect = client.post(
        "/oauth/authorize", json={"request_token": token, "approved": True}
    ).json()["redirect_uri"]
    body = {
        "grant_type": "authorization_code",
        "client_id": app["client_id"],
        "redirect_uri": "mobile://callback",
        "code": parse_qs(urlsplit(redirect).query)["code"][0],
        "code_verifier": verifier,
    }
    assert client.post("/oauth/token", data=body).json() == {
        "error": "invalid_dpop_proof"
    }
    key = ECKey.generate_key("P-256")
    proof = jwt.encode(
        {"typ": "dpop+jwt", "alg": "ES256", "jwk": key.as_dict(private=False)},
        {
            "htm": "POST",
            "htu": "https://api.followw.test/oauth/token",
            "iat": int(time.time()),
            "jti": str(uuid4()),
        },
        key,
        algorithms=["ES256"],
    )
    response = client.post("/oauth/token", data=body, headers={"DPoP": proof})
    assert response.status_code == 200
    refresh = {
        "grant_type": "refresh_token",
        "client_id": app["client_id"],
        "refresh_token": response.json()["refresh_token"],
    }
    assert client.post("/oauth/token", data=refresh).status_code == 400
    assert (
        client.post("/oauth/token", data=refresh, headers={"DPoP": proof}).status_code
        == 400
    )


def test_duas_trocas_concorrentes_emitem_apenas_uma_concessao(db, troca):
    from api.modules.oauth.authorization import exchange_code
    from api.modules.oauth.tokens import InvalidToken, TokenPair

    async def exchanges():
        arguments = {key: value for key, value in troca.items() if key != "grant_type"}
        return await asyncio.gather(
            exchange_code(db, **arguments),
            exchange_code(db, **arguments),
            return_exceptions=True,
        )

    results = asyncio.run(exchanges())
    assert sum(isinstance(result, TokenPair) for result in results) == 1
    assert sum(isinstance(result, InvalidToken) for result in results) == 1


def test_troca_inicial_nao_depende_da_fila_de_sincronizacao(client, troca, qstash):
    qstash.unavailable = True
    resposta = client.post("/oauth/token", data=troca)
    assert resposta.status_code == 200
    assert resposta.json()["refresh_token"]
    assert qstash.published == []
