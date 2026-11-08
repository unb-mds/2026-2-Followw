from datetime import UTC, datetime
from uuid import UUID

import sigaa_client
from pydantic import SecretStr
from sigaa_client import (
    Classroom,
    ClassroomMember,
    ClassroomRole,
    Credentials,
    Subject,
)
from sqlalchemy import func, select, update

from api.db.models import (
    Classroom as ClassroomModel,
)
from api.db.models import (
    ClassroomParticipant,
    Professor,
    User,
)
from api.db.models import (
    Subject as SubjectModel,
)
from api.modules.classrooms.repository import ClassroomRepository

CREDENCIAIS = Credentials(registration="251000000", password=SecretStr("senha123"))
NO_CACHE = {"Cache-Control": "no-cache"}
DASHBOARD = """
<table>
  <tr><td colspan="5">2026.2</td></tr>
  <tr>
    <td class="descricao"><form id="form_acessarTurmaVirtual">
      <a href="#" onclick="jsfcljs(x,{'frontEndIdTurma':'CURRENT'},'');">
        ESTRUTURAS DE DADOS 1
      </a>
    </form></td>
    <td>FCTE - MOCAP</td><td>35M5 35T1</td>
  </tr>
  <tr><td id="linha_123" colspan="5"></td></tr>
</table>
"""
HISTORY = """
<html><body><table class="listagem">
  <tr><td class="periodo">2026.2</td></tr>
  <tr>
    <td>FGA0146 - ESTRUTURAS DE DADOS 1</td><td>01</td>
    <td>60h</td><td>35M5 35T1</td>
    <td><a title="Acessar Turma Virtual"
      onclick="jsfcljs(x,{'frontEndIdTurma':'CURRENT'},'');">Acessar</a></td>
  </tr>
  <tr><td class="periodo">2025.2</td></tr>
  <tr>
    <td>FGA0158 - ORIENTAÇÃO A OBJETOS</td><td>02</td>
    <td>60h</td><td>24T23</td>
    <td><a title="Acessar Turma Virtual"
      onclick="jsfcljs(x,{'frontEndIdTurma':'OLD'},'');">Acessar</a></td>
  </tr>
</table></body></html>
"""


ATUAL = Classroom(
    id="AAA",
    number="01",
    semester="2026.2",
    current=True,
    subject=Subject(code="FGA0146", name="ESTRUTURAS DE DADOS 1"),
)
ANTIGA = Classroom(
    id="BBB",
    number="02",
    semester="2025.2",
    subject=Subject(code="FGA0158", name="ORIENTAÇÃO A OBJETOS"),
)
PARTICIPANTES = [
    ClassroomMember(
        name="ZECA",
        role=ClassroomRole.ALUNO,
        registration="2",
        course="ENGENHARIA DE SOFTWARE",
        unit="FCTE",
    ),
    ClassroomMember(name="NOME DOCENTE", role=ClassroomRole.PROFESSOR),
    ClassroomMember(name="ANA", role=ClassroomRole.ALUNO, registration="3"),
]


def _login(client) -> None:
    client.post(
        "/auth/sigaa", json={"registration": "251000000", "password": "senha123"}
    )


def _mencoes_sincronizadas_em(database, synced_at: datetime) -> None:
    with database() as session:
        session.execute(update(User).values(grades_synced_at=synced_at))
        session.commit()


def _mencoes_sincronizadas(database) -> datetime | None:
    with database() as session:
        return session.scalar(
            select(User.grades_synced_at).where(User.registration == "251000000")
        )


AGORA = datetime(2026, 9, 22, tzinfo=UTC)


def _turma(
    front_end_id: str,
    code: str = "FGA0146",
    semester: str = "2026.2",
    *,
    room: str | None = None,
    current: bool = False,
) -> sigaa_client.Classroom:
    return sigaa_client.Classroom(
        id=front_end_id,
        number="01",
        semester=semester,
        room=room,
        current=current,
        subject=sigaa_client.Subject(code=code, name=f"DISCIPLINA {code}", hours=60),
    )


def _membro(name: str, **fields) -> ClassroomMember:
    return ClassroomMember(
        name=name, role=fields.pop("role", ClassroomRole.ALUNO), **fields
    )


async def _salvar_turmas(
    async_database, user: User, turmas, synced_at: datetime = AGORA
) -> None:
    async with async_database() as session:
        user = await session.get_one(User, user.id)
        await ClassroomRepository(session).save_classroom_participants(
            user, turmas, synced_at
        )
        await session.commit()


async def _vinculos(async_database, user: User) -> list[ClassroomParticipant]:
    async with async_database() as session:
        links = await ClassroomRepository(session).list_by_user_id(user.id)
    return [link.row for link in links]


async def _contar(async_database, model) -> int:
    async with async_database() as session:
        return await session.scalar(select(func.count()).select_from(model))


async def _situacao_na_lista(async_database, user: User) -> dict:
    async with async_database() as session:
        rows = await session.execute(
            select(
                SubjectModel.code,
                ClassroomParticipant.front_end_id,
                ClassroomParticipant.status,
                ClassroomParticipant.locked_at,
            )
            .join(ClassroomParticipant.classroom)
            .join(ClassroomModel.subject)
            .where(ClassroomParticipant.user_id == user.id)
        )
    return {
        code: (front_end_id, status, locked_at)
        for code, front_end_id, status, locked_at in rows
    }


async def _salvar_membros(
    async_database, classroom_id: UUID, membros, synced_at: datetime = AGORA
) -> None:
    async with async_database() as session:
        await ClassroomRepository(session).save_members(
            classroom_id, membros, synced_at
        )
        await session.commit()


async def _membros(async_database, classroom_id: UUID) -> list[ClassroomParticipant]:
    async with async_database() as session:
        return await ClassroomRepository(session).list_members(classroom_id)


async def _docentes(async_database, classroom_id: UUID) -> list[Professor]:
    async with async_database() as session:
        classroom = await session.get_one(ClassroomModel, classroom_id)
        return list(classroom.professors)


async def _situacoes(async_database, classroom_id: UUID) -> dict:
    async with async_database() as session:
        rows = await session.execute(
            select(
                User.name,
                ClassroomParticipant.status,
                ClassroomParticipant.member,
                ClassroomParticipant.locked_at,
            )
            .join(ClassroomParticipant.user)
            .where(ClassroomParticipant.classroom_id == classroom_id)
        )
    return {
        name: (status, member, locked_at) for name, status, member, locked_at in rows
    }
