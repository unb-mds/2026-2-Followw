from unittest.mock import AsyncMock

import pytest
from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from api.db.enums import UserLevel
from api.db.main import get_db
from api.db.models import User
from api.repositories.user import UserRepository, UserRepositoryDep


@pytest.mark.parametrize(
    "registration", ["251000000", "251000001", "inexistente", "' OR 1=1 --"]
)
async def test_repository_busca_somente_a_matricula_pedida(registration):
    engine = create_engine("sqlite://")
    User.__table__.create(engine)
    try:
        with Session(engine) as database:
            users = [
                User(
                    name=f"Discente {index}",
                    registration=f"25100000{index}",
                    email=f"discente{index}@example.org",
                    unity="FCTE",
                    course="ENGENHARIA DE SOFTWARE",
                    level=UserLevel.GRADUACAO,
                    ira=3.5,
                    mp=4.0,
                )
                for index in range(2)
            ]
            database.add_all(users)
            database.commit()
            session = AsyncMock(spec=AsyncSession)
            session.scalar.side_effect = database.scalar

            result = await UserRepository(session).get_by_registration(registration)

            expected = next((u for u in users if u.registration == registration), None)
            assert result is expected
            session.commit.assert_not_awaited()
    finally:
        engine.dispose()


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
