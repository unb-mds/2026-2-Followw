from datetime import UTC, datetime

import pytest

from api.db.models import OAuthClient
from api.modules.oauth.clients import (
    CLIENT_ID_PREFIX,
    CLIENT_SECRET_PREFIX,
    OAuthClientCreate,
    OAuthClientUpdate,
    generate_client_id,
    generate_client_secret,
    validate_homepage_url,
    validate_redirect_uri,
    verify_client_secret,
)


def test_valida_redirect_uris_conforme_oauth_21(subtests):
    validas = [
        ("https://app.exemplo.com/callback", True),
        ("https://app.exemplo.com/callback", False),
        ("http://localhost:3000/callback", True),
        ("http://127.0.0.1:8080/oauth", False),
        ("http://[::1]:3000/callback", True),
        ("http://[::1]/callback", False),
        ("meuapp://oauth/callback", False),
    ]
    for uri, confidencial in validas:
        with subtests.test(uri=uri, confidencial=confidencial):
            assert validate_redirect_uri(uri, confidential=confidencial) == uri

    invalidas = [
        ("", False),
        ("http://app.exemplo.com/callback", False),
        ("https://app.exemplo.com/callback#frag", False),
        ("https://*.exemplo.com/callback", False),
        ("https://app.exemplo.com/*", True),
        ("meuapp://oauth/callback", True),
        ("javascript:alert(1)", False),
        ("data:text/html,ola", False),
        ("https://app.exemplo.com/com espaco", False),
    ]
    for uri, confidencial in invalidas:
        with (
            subtests.test(invalida=uri, confidencial=confidencial),
            pytest.raises(ValueError),
        ):
            validate_redirect_uri(uri, confidential=confidencial)


def test_valida_homepage_url(subtests):
    assert validate_homepage_url(None) is None
    assert validate_homepage_url("   ") is None
    assert validate_homepage_url("https://unb.br") == "https://unb.br"

    for invalida in ("ftp://unb.br", "javascript:void(0)", "https://unb.br/a b"):
        with subtests.test(invalida=invalida), pytest.raises(ValueError):
            validate_homepage_url(invalida)


def test_segredo_usa_prefixo_salt_e_verificacao_em_tempo_constante():
    plain, salt, digest = generate_client_secret()
    assert plain.startswith(CLIENT_SECRET_PREFIX)
    assert len(salt) == 32
    assert len(digest) == 32
    assert generate_client_id().startswith(CLIENT_ID_PREFIX)

    now = datetime.now(UTC)
    confidencial = OAuthClient(
        id="flw_app_1",
        owner_registration="251000000",
        name="Bot",
        description=None,
        homepage_url=None,
        confidential=True,
        redirect_uris=["https://bot.exemplo.com/cb"],
        secret_salt=salt,
        secret_hash=digest,
        created_at=now,
        updated_at=now,
    )
    publico = OAuthClient(
        id="flw_app_2",
        owner_registration="251000000",
        name="Mobile",
        description=None,
        homepage_url=None,
        confidential=False,
        redirect_uris=["meuapp://cb"],
        secret_salt=None,
        secret_hash=None,
        created_at=now,
        updated_at=now,
    )

    assert verify_client_secret(confidencial, plain)
    assert not verify_client_secret(confidencial, plain + "x")
    assert not verify_client_secret(publico, plain)


def test_schema_rejeita_uris_duplicadas_e_nome_em_branco():
    with pytest.raises(ValueError):
        OAuthClientCreate(
            name="   ",
            confidential=False,
            redirect_uris=["https://app.exemplo.com/cb"],
        )
    with pytest.raises(ValueError):
        OAuthClientCreate(
            name="App",
            confidential=False,
            redirect_uris=[
                "https://app.exemplo.com/cb",
                "https://app.exemplo.com/cb",
            ],
        )


def test_edicao_rejeita_corpo_vazio_e_campos_obrigatorios_nulos(subtests):
    for corpo in ({}, {"name": None}, {"redirect_uris": None}):
        with subtests.test(corpo=corpo), pytest.raises(ValueError):
            OAuthClientUpdate.model_validate(corpo)
    assert OAuthClientUpdate.model_validate({"description": None}).description is None
