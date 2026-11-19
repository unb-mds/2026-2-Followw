from datetime import UTC, datetime, timedelta

import sigaa_client
from pydantic import SecretStr
from sigaa_client import (
    ClassroomMember,
    ClassroomRole,
    Credentials,
    StatisticsShare,
    StudentSituation,
)
from sqlalchemy import update

from api.modules.classrooms.service import sync_members, sync_statistics
from api.modules.me.profile import sync_profile
from api.sync.engine import Job, Step
from api.sync.queue import JOBS_URL

CREDENCIAIS = Credentials(registration="251000000", password=SecretStr("senha123"))


NO_CACHE = {"Cache-Control": "no-cache"}


LOGIN = {"registration": "251000000", "password": "senha123"}


ATUAL = sigaa_client.Classroom(
    id="AAA",
    number="01",
    semester="2026.2",
    current=True,
    subject=sigaa_client.Subject(code="FGA0146", name="ESTRUTURAS DE DADOS 1"),
)


ANTIGA = sigaa_client.Classroom(
    id="BBB",
    number="02",
    semester="2025.2",
    subject=sigaa_client.Subject(code="FGA0158", name="ORIENTAÇÃO A OBJETOS"),
)


COLEGA = ClassroomMember(name="COLEGA", role=ClassroomRole.ALUNO, registration="2")


FATIA = StatisticsShare(situation=StudentSituation.APROVADO, percentage=100)


def _envelhecer(database, column, *, hours: int) -> None:
    with database() as session:
        session.execute(
            update(column.class_).values(
                {column.key: datetime.now(UTC) - timedelta(hours=hours)}
            )
        )
        session.commit()


def _gravacao_concorrente(monkeypatch, async_database, *, vence: bool) -> None:
    """Toda gravação do perfil esbarra na de outro sync; com `vence`, a outra commita."""
    from sqlalchemy.exc import IntegrityError

    from api.modules.me.repository import UserRepository

    save_profile = UserRepository.save_profile

    async def concorrente(self, profile, now, login=None):
        if vence:
            async with async_database() as session:
                await save_profile(UserRepository(session), profile, now, login)
                await session.commit()
        raise IntegrityError("INSERT INTO users", {}, Exception("unique"))

    monkeypatch.setattr(UserRepository, "save_profile", concorrente)


PERFIL = Job(credentials=CREDENCIAIS, steps=(Step.of(sync_profile),))


TELAS = Job(
    credentials=CREDENCIAIS,
    classroom_id="AAA",
    steps=(Step.of(sync_members), Step.of(sync_statistics)),
)


def _entregar(client, qstash, body: str, *, signature: str | None = None):
    signature = signature or qstash.sign(JOBS_URL, body)
    return client.post("/jobs", content=body, headers={"Upstash-Signature": signature})
