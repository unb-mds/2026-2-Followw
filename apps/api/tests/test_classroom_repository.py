from datetime import UTC, datetime
from unittest.mock import AsyncMock
from uuid import UUID

import pytest
import sigaa_client
from sigaa_client import (
    ClassroomMember,
    ClassroomRole,
    StatisticsShare,
    StudentSituation,
)
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.enums import UserLevel
from api.db.main import get_db
from api.db.models import Classroom, ClassroomStatistic, ClassroomUser, Subject, User
from api.repositories.classroom import ClassroomRepository, ClassroomRepositoryDep

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


async def _salvar_turmas(async_database, user: User, turmas) -> None:
    async with async_database() as session:
        user = await session.get_one(User, user.id)
        await ClassroomRepository(session).save_user_classrooms(user, turmas, AGORA)
        await session.commit()


async def _vinculos(async_database, user: User) -> list[ClassroomUser]:
    async with async_database() as session:
        return await ClassroomRepository(session).list_by_user_id(user.id)


async def _contar(async_database, model) -> int:
    async with async_database() as session:
        return await session.scalar(select(func.count()).select_from(model))


async def test_turmas_do_usuario_guardam_id_do_sigaa_e_semestre_atual(
    async_database, usuarios
):
    await _salvar_turmas(
        async_database,
        usuarios[0],
        [_turma("AAA", current=True), _turma("BBB", "FGA0158", "2025.2")],
    )

    links = await _vinculos(async_database, usuarios[0])

    assert sorted((l.front_end_id, l.current, l.classroom.semester) for l in links) == [
        ("AAA", True, "2026.2"),
        ("BBB", False, "2025.2"),
    ]
    assert {l.classroom.subject.code for l in links} == {"FGA0146", "FGA0158"}


async def test_resync_remove_turma_que_saiu_da_lista(async_database, usuarios):
    await _salvar_turmas(
        async_database, usuarios[0], [_turma("AAA"), _turma("BBB", "FGA0158")]
    )
    await _salvar_turmas(async_database, usuarios[0], [_turma("AAA")])

    links = await _vinculos(async_database, usuarios[0])

    assert [l.front_end_id for l in links] == ["AAA"]


async def test_turma_e_compartilhada_entre_alunos(async_database, usuarios):
    await _salvar_turmas(async_database, usuarios[0], [_turma("AAA", room="MOCAP")])
    # O segundo aluno só vê a turma pelo histórico, sem a sala.
    await _salvar_turmas(async_database, usuarios[1], [_turma("XYZ")])

    assert await _contar(async_database, Classroom) == 1
    assert await _contar(async_database, Subject) == 1
    link = (await _vinculos(async_database, usuarios[1]))[0]
    assert (link.front_end_id, link.classroom.room) == ("XYZ", "MOCAP")


async def _salvar_membros(async_database, classroom_id: UUID, membros) -> None:
    async with async_database() as session:
        await ClassroomRepository(session).save_members(classroom_id, membros, AGORA)
        await session.commit()


async def _membros(async_database, classroom_id: UUID) -> list[ClassroomUser]:
    async with async_database() as session:
        return await ClassroomRepository(session).list_members(classroom_id)


async def test_participantes_viram_usuarios_sombra_sem_duplicar(
    async_database, usuarios
):
    await _salvar_turmas(async_database, usuarios[0], [_turma("AAA")])
    classroom_id = (await _vinculos(async_database, usuarios[0]))[0].classroom_id
    membros = [
        _membro("NOME DOCENTE", role=ClassroomRole.PROFESSOR, email="d@unb.br"),
        _membro("Discente 0", registration="251000000", person_id=7, email="eu@x.org"),
        _membro("COLEGA", registration="251000009", person_id=9),
    ]

    await _salvar_membros(async_database, classroom_id, membros)
    await _salvar_membros(async_database, classroom_id, membros)

    links = await _membros(async_database, classroom_id)
    assert sorted((l.user.name, l.role) for l in links) == [
        ("COLEGA", ClassroomRole.ALUNO),
        ("Discente 0", ClassroomRole.ALUNO),
        ("NOME DOCENTE", ClassroomRole.PROFESSOR),
    ]
    assert await _contar(async_database, User) == 4
    eu = next(l for l in links if l.user_id == usuarios[0].id)
    # O vínculo da própria lista continua o mesmo, e o perfil ganha o que faltava.
    assert (eu.front_end_id, eu.user.person_id, eu.user.email) == ("AAA", 7, "eu@x.org")


async def test_docente_e_identificado_pelo_email_entre_turmas(async_database, usuarios):
    await _salvar_turmas(
        async_database, usuarios[0], [_turma("AAA"), _turma("BBB", "FGA0158")]
    )
    links = await _vinculos(async_database, usuarios[0])
    docente = _membro("NOME DOCENTE", role=ClassroomRole.PROFESSOR, email="d@unb.br")
    await _salvar_membros(async_database, links[0].classroom_id, [docente])
    # Mesmo email com outro nome é o mesmo docente; mesmo nome sem email, não.
    await _salvar_membros(
        async_database,
        links[1].classroom_id,
        [docente.model_copy(update={"name": "NOME ABREVIADO"})],
    )

    async with async_database() as session:
        docentes = list(
            await session.scalars(select(User).where(User.email == "d@unb.br"))
        )
    assert [d.name for d in docentes] == ["NOME ABREVIADO"]


async def test_docente_sem_email_nao_duplica_no_resync_da_turma(
    async_database, usuarios
):
    await _salvar_turmas(async_database, usuarios[0], [_turma("AAA")])
    classroom_id = (await _vinculos(async_database, usuarios[0]))[0].classroom_id
    docente = _membro("NOME DOCENTE", role=ClassroomRole.PROFESSOR)

    await _salvar_membros(async_database, classroom_id, [docente])
    await _salvar_membros(async_database, classroom_id, [docente])

    assert await _contar(async_database, User) == 3


async def test_turma_passada_existente_nao_e_regravada(async_database, usuarios):
    passada = _turma("AAA", semester="2025.2").model_copy(update={"schedule": "24T23"})
    atual = _turma("CCC", "FGA0158", room="MOCAP", current=True)
    await _salvar_turmas(async_database, usuarios[0], [passada, atual])

    await _salvar_turmas(
        async_database,
        usuarios[1],
        [
            passada.model_copy(update={"id": "XYZ", "schedule": "99Z9"}),
            atual.model_copy(update={"id": "WWW", "room": "SALA 02"}),
        ],
    )

    links = await _vinculos(async_database, usuarios[1])
    assert sorted(
        (l.front_end_id, l.classroom.schedule, l.classroom.room) for l in links
    ) == [
        ("WWW", None, "SALA 02"),
        ("XYZ", "24T23", None),
    ]


async def test_participante_que_saiu_da_turma_perde_o_vinculo(async_database, usuarios):
    await _salvar_turmas(async_database, usuarios[0], [_turma("AAA")])
    classroom_id = (await _vinculos(async_database, usuarios[0]))[0].classroom_id
    colega = _membro("COLEGA", registration="251000009")

    await _salvar_membros(async_database, classroom_id, [colega])
    await _salvar_membros(async_database, classroom_id, [])

    assert await _membros(async_database, classroom_id) == []
    # O vínculo que veio da lista do próprio usuário continua.
    assert len(await _vinculos(async_database, usuarios[0])) == 1


async def test_estatisticas_substituem_as_anteriores(async_database, usuarios):
    await _salvar_turmas(async_database, usuarios[0], [_turma("AAA")])
    classroom_id = (await _vinculos(async_database, usuarios[0]))[0].classroom_id

    for shares in (
        [StatisticsShare(situation=StudentSituation.MATRICULADO, percentage=100)],
        [
            StatisticsShare(situation=StudentSituation.APROVADO, percentage=90),
            StatisticsShare(situation=StudentSituation.MATRICULADO, percentage=10),
        ],
    ):
        async with async_database() as session:
            await ClassroomRepository(session).save_statistics(
                classroom_id, shares, AGORA
            )
            await session.commit()

    async with async_database() as session:
        statistics = await ClassroomRepository(session).list_statistics(classroom_id)
        classroom = await session.get_one(Classroom, classroom_id)
    assert sorted((s.situation.value, s.percentage) for s in statistics) == [
        ("aprovado", 90),
        ("matriculado", 10),
    ]
    assert classroom.statistics_synced_at is not None
    assert await _contar(async_database, ClassroomStatistic) == 2


def test_repository_aceita_sessao_injetada(probe_app):
    async def probe(repository: ClassroomRepositoryDep):
        return {"count": len(await repository.list_by_user_id(UUID(int=1)))}

    session = AsyncMock(spec=AsyncSession)
    session.scalars.return_value = []

    async def fake_db():
        yield session

    client = probe_app(probe)
    client.app.dependency_overrides[get_db] = fake_db
    try:
        response = client.get("/probe")
        assert response.status_code == 200
        assert response.json() == {"count": 0}
        session.scalars.assert_awaited_once()
    finally:
        client.app.dependency_overrides.clear()


async def test_banco_barra_docente_duplicado_em_syncs_concorrentes(async_database):
    """Sem o índice parcial, a corrida entre dois syncs criaria o mesmo docente
    duas vezes; com ele, a segunda gravação falha e é refeita como update."""
    async with async_database() as session:
        session.add_all(
            [User(name="DOCENTE", email="d@unb.br"), User(name="D", email="d@unb.br")]
        )
        with pytest.raises(IntegrityError):
            await session.commit()

    async with async_database() as session:
        session.add_all(
            [
                User(name="DISCENTE", email="d@unb.br", registration="1"),
                User(name="DOCENTE", email="d@unb.br"),
                User(name="SEM EMAIL"),
                User(name="SEM EMAIL"),
            ]
        )
        await session.commit()
