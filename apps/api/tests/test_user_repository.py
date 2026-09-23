from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest
from sigaa_client import UserLevel as SigaaUserLevel
from sigaa_client import UserProfile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.enums import UserLevel
from api.db.main import get_db
from api.db.models import User
from api.repositories.user import UserRepository, UserRepositoryDep

AGORA = datetime(2026, 9, 22, tzinfo=UTC)
PERFIL = UserProfile(
    name="NOME DISCENTE",
    registration="251000000",
    photo=None,
    bio="Bio.",
    unity="FCTE",
    course="ENGENHARIA DE SOFTWARE",
    integralization=35,
    ira=3.9,
    mp=4.1,
    level=SigaaUserLevel.GRADUACAO,
)


@pytest.mark.parametrize(
    "registration", ["251000000", "251000001", "inexistente", "' OR 1=1 --"]
)
async def test_repository_busca_somente_a_matricula_pedida(
    async_database, registration
):
    async with async_database() as session:
        session.add_all(
            User(
                name=f"Discente {index}",
                registration=f"25100000{index}",
                level=UserLevel.GRADUACAO,
            )
            for index in range(2)
        )
        await session.commit()

        result = await UserRepository(session).get_by_registration(registration)

    assert (result.registration if result else None) == (
        registration if registration.startswith("25100000") else None
    )


async def test_perfil_cria_usuario_com_data_de_sync(async_database):
    async with async_database() as session:
        await UserRepository(session).save_profile(PERFIL, AGORA)
        await session.commit()

    async with async_database() as session:
        user = await UserRepository(session).get_by_registration("251000000")

    assert user is not None
    assert (user.name, user.ira, user.level) == (
        "NOME DISCENTE",
        3.9,
        UserLevel.GRADUACAO,
    )
    assert user.profile_synced_at is not None


async def test_perfil_assume_o_usuario_sombra_da_mesma_matricula(async_database):
    async with async_database() as session:
        session.add(
            User(
                name="NOME DA LISTA",
                registration="251000000",
                person_id=42,
                email="discente@example.org",
            )
        )
        await session.commit()

        await UserRepository(session).save_profile(PERFIL, AGORA)
        await session.commit()

    async with async_database() as session:
        users = list(await session.scalars(select(User)))

    assert len(users) == 1
    assert users[0].name == "NOME DISCENTE"
    # O perfil não traz esses campos: o que a lista de participantes trouxe fica.
    assert (users[0].person_id, users[0].email) == (42, "discente@example.org")


def test_repository_permite_injetar_sessao_mockada(probe_app):
    async def probe(repository: UserRepositoryDep):
        return {"exists": await repository.get_by_registration("251000000") is not None}

    session = AsyncMock(spec=AsyncSession)
    session.scalar.return_value = None

    async def fake_db():
        yield session

    client = probe_app(probe)
    client.app.dependency_overrides[get_db] = fake_db
    try:
        response = client.get("/probe")
        assert response.status_code == 200
        assert response.json() == {"exists": False}
        session.scalar.assert_awaited_once()
    finally:
        client.app.dependency_overrides.clear()
