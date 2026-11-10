from sigaa_client import ClassroomRole, UserProfile
from sigaa_client import UserLevel as SigaaUserLevel
from sqlalchemy import update

from api.db.enums import ClassroomRole as DbRole
from api.db.models import Professor, User
from api.modules.me.repository import UserRepository

from .helpers import (
    AGORA,
    _contar,
    _membro,
    _membros,
    _salvar_membros,
    _salvar_turmas,
    _turma,
    _vinculos,
)


async def test_participantes_viram_usuarios_sombra_sem_duplicar(
    async_database, usuarios
):
    await _salvar_turmas(async_database, usuarios[0], [_turma("AAA")])
    classroom_id = (await _vinculos(async_database, usuarios[0]))[0].classroom_id
    membros = [
        _membro("NOME DOCENTE", role=ClassroomRole.PROFESSOR, email="d@unb.br"),
        _membro("Discente 0", registration="251000000", email="eu@x.org"),
        _membro("COLEGA", registration="251000009", role=ClassroomRole.MONITOR),
    ]

    await _salvar_membros(async_database, classroom_id, membros)
    await _salvar_membros(async_database, classroom_id, membros)

    links = await _membros(async_database, classroom_id)
    # Docente não vira usuário: fica em `professors`.
    assert sorted((l.user.name, l.role) for l in links) == [
        ("COLEGA", DbRole.MONITOR),
        ("Discente 0", DbRole.ALUNO),
    ]
    assert await _contar(async_database, User) == 3
    assert await _contar(async_database, Professor) == 1
    eu = next(l for l in links if l.user_id == usuarios[0].id)
    # O vínculo da própria lista continua o mesmo, e o perfil ganha o que faltava.
    assert (eu.front_end_id, eu.user.email) == ("AAA", "eu@x.org")


async def test_troca_de_curso_une_a_conta_e_a_sombra_da_matricula_nova(
    async_database, usuarios
):
    conta, colega = usuarios
    await _salvar_turmas(async_database, conta, [_turma("AAA")])
    await _salvar_turmas(async_database, colega, [_turma("BBB", "FGA0158")])
    turmas = [
        (await _vinculos(async_database, user))[0].classroom_id for user in usuarios
    ]
    # Antes do perfil, as listas de participantes já criaram a sombra da matrícula nova.
    nova = _membro("Discente 0", registration="252000000", email="eu@x.org")
    for classroom_id in turmas:
        await _salvar_membros(async_database, classroom_id, [nova])

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
        await UserRepository(session).save_profile(perfil, AGORA, login="251000000")
        await session.commit()

    async with async_database() as session:
        user = await UserRepository(session).get_by_registration("251000000")
    assert (user.id, user.registration, user.old_registration, user.email) == (
        conta.id,
        "252000000",
        "251000000",
        "eu@x.org",
    )
    assert await _contar(async_database, User) == 2
    # A turma da sombra passa para a conta, sem duplicar a que as duas tinham.
    for classroom_id in turmas:
        links = await _membros(async_database, classroom_id)
        assert [l.user_id for l in links] == [conta.id]


async def test_matricula_antiga_na_lista_de_participantes_cai_na_conta(
    async_database, usuarios
):
    conta = usuarios[0]
    async with async_database() as session:
        await session.execute(
            update(User)
            .where(User.id == conta.id)
            .values(registration="252000000", old_registration="251000000")
        )
        await session.commit()
    await _salvar_turmas(async_database, conta, [_turma("AAA", "FGA0146", "2025.1")])
    classroom_id = (await _vinculos(async_database, conta))[0].classroom_id

    await _salvar_membros(
        async_database, classroom_id, [_membro("Discente 0", registration="251000000")]
    )

    assert await _contar(async_database, User) == 2
    links = await _membros(async_database, classroom_id)
    assert [l.user_id for l in links] == [conta.id]
