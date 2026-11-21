import asyncio
import time
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from joserfc import jwt
from joserfc.jwk import ECKey

from api.cookies import decrypt_cookie
from api.db.models import OAuthGrant
from api.modules.oauth.proof import Proof
from api.modules.oauth.scopes import Scope
from api.modules.oauth.tokens import InvalidToken, renew_access, revoke

ENDPOINT = "https://api.followw.test/oauth/token"


def _prova(key):
    return jwt.encode(
        {"typ": "dpop+jwt", "alg": "ES256", "jwk": key.as_dict(private=False)},
        {"htm": "POST", "htu": ENDPOINT, "iat": int(time.time()), "jti": str(uuid4())},
        key,
        algorithms=["ES256"],
    )


def test_refresh_publico_reutilizavel_exige_prova_nova_da_mesma_instalacao(
    client, emitir, database, stub_sigaa
):
    key = ECKey.generate_key("P-256")
    first = _prova(key)
    pair = emitir(proof=Proof.verify(first, ENDPOINT))
    body = {
        "client_id": "agenda",
        "grant_type": "refresh_token",
        "refresh_token": pair.refresh_token,
    }

    def renew(proof):
        return client.post("/oauth/token", data=body, headers={"DPoP": proof})

    with database.begin() as session:
        session.get(OAuthGrant, pair.grant_id).expires_at = datetime.now(
            UTC
        ) + timedelta(minutes=1)
    assert renew(first).json() == {"error": "invalid_dpop_proof"}
    assert renew(_prova(ECKey.generate_key("P-256"))).status_code == 400
    proof = _prova(key)
    response = renew(proof)
    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "no-store"
    assert response.json()["scope"] == "profile:read"
    assert response.json()["expires_in"] == 2400
    access = response.json()["access_token"]
    assert (
        client.get("/me", headers={"Authorization": f"Bearer {access}"}).status_code
        == 200
    )
    assert renew(proof).status_code == 400
    assert renew(_prova(key)).status_code == 200
    with database() as session:
        assert session.get(OAuthGrant, pair.grant_id).expires_at > datetime.now(
            UTC
        ) + timedelta(days=13)


def test_refresh_confidencial_exige_aplicacao_autenticada_e_autorizacao_ativa(
    db, emitir
):
    pair = emitir(Scope.RU)

    def renew(token, app, authenticated):
        return asyncio.run(
            renew_access(db, token, client_id=app, authenticated_client=authenticated)
        )

    for token, app, authenticated in (
        (pair.refresh_token, "outro", True),
        (pair.refresh_token, "agenda", False),
        (pair.access_token, "agenda", True),
    ):
        with pytest.raises(InvalidToken):
            renew(token, app, authenticated)
    renewed = renew(pair.refresh_token, "agenda", True)
    assert renewed.access_token != pair.access_token
    assert renewed.refresh_token == pair.refresh_token
    assert renewed.scopes == pair.scopes
    assert decrypt_cookie("access_token", renewed.access_token.split(".", 1)[1]) is None
    asyncio.run(revoke(db, pair.grant_id, registration="251000000"))
    with pytest.raises(InvalidToken):
        renew(pair.refresh_token, "agenda", True)


def test_credenciais_nao_sao_gravadas_e_cada_concessao_tem_seu_salt(emitir, database):
    pairs = [emitir(), emitir()]
    with database() as session:
        grants = [session.get(OAuthGrant, pair.grant_id) for pair in pairs]
        assert grants[0].salt != grants[1].salt
        for row, pair in zip(grants, pairs, strict=True):
            values = str(vars(row))
            assert all(
                v not in values
                for v in ("senha123", pair.refresh_token, pair.access_token)
            )
            assert "senha123" not in pair.access_token + pair.refresh_token
