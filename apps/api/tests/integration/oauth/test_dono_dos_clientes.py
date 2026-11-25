from datetime import UTC, datetime

from sigaa_client import Credentials, UserProfile
from sigaa_client import UserLevel as SigaaUserLevel
from sqlalchemy import select

from api.db.models import OAuthClient, OAuthGrant
from api.modules.me.repository import UserRepository
from api.modules.oauth.clients import (
    OAuthClientCreate,
    create_client,
    list_clients,
    list_grants,
    resolve_user_id,
)
from api.modules.oauth.scopes import Scope
from api.modules.oauth.tokens import create_token_pair

BODY = OAuthClientCreate(
    name="App", confidential=False, redirect_uris=["https://app.exemplo.com/cb"]
)


async def test_dono_e_o_usuario_da_matricula_sem_duplicar(db):
    primeiro = await resolve_user_id(db, "251000000")

    assert await resolve_user_id(db, "251000000") == primeiro


async def test_troca_de_matricula_mantem_os_clientes_do_dono(db, async_database):
    antiga = await resolve_user_id(db, "251000000")
    # O login pela matrícula nova cria a sombra, que já cadastra um app.
    sombra = await resolve_user_id(db, "252000000")
    app = await create_client(
        db, sombra, OAuthClientCreate(**{**BODY.model_dump(), "confidential": True})
    )
    par = await db.write(
        lambda session: create_token_pair(
            session,
            client_id=app.client_id,
            credentials=Credentials(registration="252000000", password="senha123"),
            accepted=[Scope.PROFILE],
            authenticated_client=True,
        )
    )
    perfil = UserProfile(
        name="Discente 0",
        registration="252000000",
        photo=None,
        bio=None,
        unit="FCTE",
        course="ENGENHARIA DE SOFTWARE",
        shift=None,
        entry_semester=None,
        integralization=None,
        workload=None,
        ira=None,
        mp=None,
        level=SigaaUserLevel.GRADUACAO,
    )
    async with async_database() as session:
        await UserRepository(session).save_profile(
            perfil, datetime.now(UTC), login="251000000"
        )
        await session.commit()

    assert await resolve_user_id(db, "252000000") == antiga
    assert [c.name for c in await list_clients(db, antiga)] == ["App"]
    assert [g.client_id for g in await list_grants(db, antiga)] == [app.client_id]
    async with async_database() as session:
        assert (await session.get(OAuthGrant, par.grant_id)).user_id == antiga
    async with async_database() as session:
        donos = (await session.scalars(select(OAuthClient.owner_id))).all()
    assert donos == [antiga]
