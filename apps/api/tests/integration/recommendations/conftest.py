import pytest
from sigaa_client import (
    Credentials,
)
from sigaa_client import UserLevel as SigaaUserLevel
from sigaa_client import UserProfile as SigaaUserProfile

from api.modules.classrooms.repository import ClassroomRepository
from api.modules.me.repository import UserRepository
from api.modules.recommendations.service import _rank, _student

from .helpers import (
    NOW,
    Scenario,
)


@pytest.fixture
def scene(database, client, cookies, stub_sigaa):
    client.cookies.update(
        cookies(refresh=Credentials(registration="251000000", password="senha"))
    )
    return Scenario(database, client)


@pytest.fixture
def ranked(scene, async_database):
    """O ranking interno, com score e pontos que a API não expõe."""

    async def run():
        async with async_database() as session:
            user = await UserRepository(session).get_by_registration("251000000")
            student = await _student(session, user)
            reference = await ClassroomRepository(session).offer_semester()
            return await _rank(session, student, reference)

    return run


@pytest.fixture
def assign(scene, async_database):
    """Sincroniza o perfil, que infere a matriz pelo semestre de entrada."""

    async def run(entry="2025.1", course="ENGENHARIA DE SOFTWARE"):
        profile = SigaaUserProfile(
            name="Aluno",
            registration="251000000",
            photo=None,
            bio=None,
            unit="FCTE",
            course=course,
            shift=None,
            entry_semester=entry,
            integralization=None,
            workload=None,
            ira=None,
            mp=None,
            level=SigaaUserLevel.GRADUACAO,
        )
        async with async_database() as session:
            await UserRepository(session).save_profile(profile, NOW)
            await session.commit()

    return run
