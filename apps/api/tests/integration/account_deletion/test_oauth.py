import asyncio
from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest
from sigaa_client import Credentials
from sqlalchemy import select

from api.db.main import Database
from api.db.models import OAuthClient, OAuthGrant, User
from api.modules.oauth.scopes import Scope
from api.modules.oauth.tokens import create_token_pair

from .helpers import authorization


@pytest.mark.parametrize(
    ("owned", "connected", "expired"),
    [
        (False, False, False),
        (True, False, False),
        (False, True, False),
        (True, True, False),
        (False, True, True),
    ],
)
def test_informa_apps_proprios_e_conectados_sem_buscar_perfil(
    client,
    applications,
    stub_sigaa,
    async_database,
    database,
    owned,
    connected,
    expired,
):
    own, other = applications
    if not owned:
        assert client.delete(f"/oauth/clients/{own['client_id']}").status_code == 204
    if connected:
        pair = asyncio.run(
            Database(async_database).write(
                lambda session: create_token_pair(
                    session,
                    client_id=other["client_id"],
                    credentials=Credentials(
                        registration="251000000", password="senha123"
                    ),
                    accepted=[Scope.PROFILE],
                    authenticated_client=True,
                )
            )
        )
        if expired:
            with database() as session:
                session.get(OAuthGrant, pair.grant_id).expires_at = datetime.now(
                    UTC
                ) - timedelta(seconds=1)
                session.commit()
    response = client.get("/me/data")
    assert response.status_code == 200
    assert response.json()["applications"] == (["Agenda"] if owned else [])
    assert response.json()["has_connected_applications"] == (connected and not expired)
    stub_sigaa.created.assert_not_called()


def test_remove_apps_e_autorizacoes_sem_afetar_apps_alheios(
    client, conta, applications, async_database, database, stub_sigaa
):
    own, other = applications
    db = Database(async_database)

    def issue(application, registration):
        return asyncio.run(
            db.write(
                lambda session: create_token_pair(
                    session,
                    client_id=application["client_id"],
                    credentials=Credentials(
                        registration=registration, password="senha123"
                    ),
                    accepted=[Scope.PROFILE],
                    authenticated_client=True,
                )
            )
        )

    personal = issue(other, "251000000")
    affected_peer = issue(own, "251000001")
    unaffected_peer = issue(other, "251000001")
    assert client.delete("/me/data").status_code == 204
    with database() as session:
        assert (
            session.scalar(
                select(OAuthClient).where(OAuthClient.client_id == own["client_id"])
            )
            is None
        )
        assert (
            session.scalar(
                select(OAuthClient).where(OAuthClient.client_id == other["client_id"])
            )
            is not None
        )
        assert session.get(OAuthGrant, personal.grant_id) is None
        assert session.get(OAuthGrant, affected_peer.grant_id) is None
        assert session.get(OAuthGrant, unaffected_peer.grant_id) is not None
    for pair in (personal, affected_peer):
        assert (
            client.get(
                "/me", headers={"Authorization": f"Bearer {pair.access_token}"}
            ).status_code
            == 401
        )
    profile = stub_sigaa.profile.get_profile.return_value
    stub_sigaa.profile.get_profile.return_value = profile.model_copy(
        update={"registration": "251000001"}
    )
    assert (
        client.get(
            "/me", headers={"Authorization": f"Bearer {unaffected_peer.access_token}"}
        ).status_code
        == 200
    )


def test_consentimento_anterior_a_exclusao_nao_pode_ser_aprovado(client, applications):
    token, _ = authorization(client, applications[1])
    assert client.delete("/me/data").status_code == 204
    response = client.post(
        "/oauth/authorize", json={"request_token": token, "approved": True}
    )
    assert response.status_code == 400
    fresh, _ = authorization(client, applications[1])
    assert (
        client.post(
            "/oauth/authorize", json={"request_token": fresh, "approved": True}
        ).status_code
        == 200
    )


def test_codigo_emitido_antes_da_exclusao_nao_cria_nova_autorizacao(
    client, applications, database
):
    application = applications[1]
    token, verifier = authorization(client, application)
    approved = client.post(
        "/oauth/authorize", json={"request_token": token, "approved": True}
    )
    code = parse_qs(urlsplit(approved.json()["redirect_uri"]).query)["code"][0]
    assert client.delete("/me/data").status_code == 204
    response = client.post(
        "/oauth/token",
        data={
            "grant_type": "authorization_code",
            "client_id": application["client_id"],
            "client_secret": application["client_secret"],
            "code": code,
            "redirect_uri": application["redirect_uris"][0],
            "code_verifier": verifier,
        },
    )
    assert response.status_code == 400
    assert response.json()["error"] == "invalid_grant"
    with database() as session:
        assert session.scalar(select(OAuthGrant)) is None


def test_troca_de_codigo_concorrente_nao_impede_exclusao_do_dono_do_app(
    client, conta, applications, database
):
    from api.main import app

    application = applications[0]
    token, verifier = authorization(client, application)
    approved = client.post(
        "/oauth/authorize", json={"request_token": token, "approved": True}
    )
    code = parse_qs(urlsplit(approved.json()["redirect_uri"]).query)["code"][0]

    async def race():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://testserver",
            cookies=dict(client.cookies),
        ) as concurrent:
            return await asyncio.wait_for(
                asyncio.gather(
                    concurrent.post(
                        "/oauth/token",
                        data={
                            "grant_type": "authorization_code",
                            "client_id": application["client_id"],
                            "client_secret": application["client_secret"],
                            "code": code,
                            "redirect_uri": application["redirect_uris"][0],
                            "code_verifier": verifier,
                        },
                    ),
                    concurrent.delete("/me/data"),
                ),
                timeout=5,
            )

    exchange, deletion = client.portal.call(race)
    assert deletion.status_code == 204
    assert exchange.status_code in (200, 400, 401)
    with database() as session:
        assert (
            session.scalar(
                select(OAuthClient).where(OAuthClient.owner_id == conta.user)
            )
            is None
        )
        assert session.scalar(select(OAuthGrant)) is None


def test_renovacao_oauth_nao_agenda_sync_apos_exclusao_concorrente(
    client, conta, applications, async_database, database, monkeypatch, qstash
):
    from api.main import app
    from api.modules.oauth import router

    application = applications[1]
    pair = asyncio.run(
        Database(async_database).write(
            lambda session: create_token_pair(
                session,
                client_id=application["client_id"],
                credentials=Credentials(registration="251000000", password="senha123"),
                accepted=[Scope.PROFILE],
                authenticated_client=True,
            )
        )
    )

    async def delete_before_scheduling(*args, **kwargs):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://testserver",
            cookies=dict(client.cookies),
        ) as concurrent:
            assert (await concurrent.delete("/me/data")).status_code == 204
        return pair

    monkeypatch.setattr(router, "renew_access", delete_before_scheduling)
    response = client.post(
        "/oauth/token",
        data={
            "grant_type": "refresh_token",
            "client_id": application["client_id"],
            "client_secret": application["client_secret"],
            "refresh_token": pair.refresh_token,
        },
    )
    assert response.status_code == 400
    assert response.json() == {"error": "invalid_grant"}
    assert not qstash.published
    with database() as session:
        user = session.get(User, conta.user)
        assert user.ira is None
        assert user.registered_at is None
