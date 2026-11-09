import pytest
from sigaa_client import StatisticsShare, StudentSituation

from api.db.enums import UserLevel
from api.db.models import User

from .helpers import AGORA, ANTIGA, ATUAL, DASHBOARD, HISTORY, PARTICIPANTES


@pytest.fixture
def classrooms_sigaa(sigaa):
    sigaa.profile = sigaa.profile.replace("</body>", f"{DASHBOARD}</body>")
    sigaa.classrooms = HISTORY
    return sigaa


@pytest.fixture
def turmas(stub_sigaa):
    stub_sigaa.classrooms.list_classrooms.return_value = [ATUAL, ANTIGA]
    stub_sigaa.classrooms.list_classroom_members.return_value = PARTICIPANTES
    stub_sigaa.classrooms.get_classroom_statistics.return_value = (
        StatisticsShare(situation=StudentSituation.MATRICULADO, percentage=10),
        StatisticsShare(situation=StudentSituation.APROVADO, percentage=90),
    )
    return stub_sigaa


@pytest.fixture
async def usuarios(async_database) -> list[User]:
    async with async_database() as session:
        users = [
            User(
                name=f"Discente {index}",
                registration=f"25100000{index}",
                level=UserLevel.GRADUACAO,
                profile_synced_at=AGORA,
            )
            for index in range(2)
        ]
        session.add_all(users)
        await session.commit()
    return users
