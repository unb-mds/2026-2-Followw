from datetime import date, timedelta

import sigaa_client
from sqlalchemy import event

from api.db.enums import ClassroomStatus
from api.db.models import Classroom as ClassroomModel
from api.db.models import Subject as SubjectModel
from api.db.models import User

from .helpers import (
    AGORA,
    _contar,
    _membro,
    _membros,
    _salvar_membros,
    _salvar_turmas,
    _situacao_na_lista,
    _situacoes,
    _turma,
    _vinculos,
)


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


async def test_turma_que_saiu_da_lista_e_trancada(async_database, usuarios):
    await _salvar_turmas(
        async_database, usuarios[0], [_turma("AAA"), _turma("BBB", "FGA0158")]
    )
    await _salvar_turmas(async_database, usuarios[0], [_turma("AAA")])

    links = await _vinculos(async_database, usuarios[0])

    assert [l.front_end_id for l in links] == ["AAA"]
    assert await _situacao_na_lista(async_database, usuarios[0]) == {
        "FGA0146": ("AAA", ClassroomStatus.CURSANDO, None),
        "FGA0158": (None, ClassroomStatus.TRANCADO, AGORA),
    }


async def test_turma_que_volta_para_a_lista_volta_cursando(async_database, usuarios):
    await _salvar_turmas(
        async_database, usuarios[0], [_turma("AAA"), _turma("BBB", "FGA0158")]
    )
    await _salvar_turmas(async_database, usuarios[0], [_turma("AAA")])
    # O trancamento mantém a primeira data mesmo em novos syncs.
    await _salvar_turmas(
        async_database, usuarios[0], [_turma("AAA")], AGORA + timedelta(days=1)
    )
    assert (await _situacao_na_lista(async_database, usuarios[0]))["FGA0158"] == (
        None,
        ClassroomStatus.TRANCADO,
        AGORA,
    )

    await _salvar_turmas(
        async_database, usuarios[0], [_turma("AAA"), _turma("CCC", "FGA0158")]
    )

    assert (await _situacao_na_lista(async_database, usuarios[0]))["FGA0158"] == (
        "CCC",
        ClassroomStatus.CURSANDO,
        None,
    )


async def test_turma_sem_numero_ou_codigo_nao_e_gravada(async_database, usuarios):
    # A turma só do portal ainda não tem o número e o código que o histórico traz.
    sem_numero = _turma("AAA", current=True).model_copy(update={"number": ""})
    sem_codigo = _turma("CCC", current=True).model_copy(
        update={"subject": sigaa_client.Subject(name="DISCIPLINA SEM CÓDIGO")}
    )

    await _salvar_turmas(
        async_database,
        usuarios[0],
        [sem_numero, sem_codigo, _turma("BBB", "FGA0158")],
    )

    links = await _vinculos(async_database, usuarios[0])
    assert [l.front_end_id for l in links] == ["BBB"]
    assert await _contar(async_database, ClassroomModel) == 1
    assert await _contar(async_database, SubjectModel) == 1


async def test_turma_e_compartilhada_entre_alunos(async_database, usuarios):
    await _salvar_turmas(async_database, usuarios[0], [_turma("AAA", room="MOCAP")])
    # O segundo aluno só vê a turma pelo histórico, sem a sala.
    await _salvar_turmas(async_database, usuarios[1], [_turma("XYZ")])

    assert await _contar(async_database, ClassroomModel) == 1
    assert await _contar(async_database, SubjectModel) == 1
    link = (await _vinculos(async_database, usuarios[1]))[0]
    assert (link.front_end_id, link.classroom.room) == ("XYZ", "MOCAP")


async def test_turma_grande_nao_consulta_o_banco_por_participante(
    async_database, usuarios
):
    await _salvar_turmas(async_database, usuarios[0], [_turma("AAA")])
    classroom_id = (await _vinculos(async_database, usuarios[0]))[0].classroom_id
    membros = [
        _membro(f"ALUNO {i}", registration=f"26{i:07}", email=f"{i}@x")
        for i in range(300)
    ]
    await _salvar_membros(async_database, classroom_id, membros[:100])

    selects: list[str] = []
    engine = async_database.kw["bind"].sync_engine
    listener = lambda *args: selects.append(args[2])
    event.listen(engine, "before_cursor_execute", listener)
    try:
        await _salvar_membros(async_database, classroom_id, membros)
    finally:
        event.remove(engine, "before_cursor_execute", listener)

    assert len([sql for sql in selects if sql.lstrip().startswith("SELECT")]) < 10
    assert len(await _membros(async_database, classroom_id)) == 300
    assert await _contar(async_database, User) == 302


async def test_historico_nao_consulta_o_banco_por_turma(async_database, usuarios):
    historico = [
        _turma(f"T{i}", f"FGA{i:04}", "2025.2", current=i < 5) for i in range(40)
    ]
    await _salvar_turmas(async_database, usuarios[0], historico)

    selects: list[str] = []
    engine = async_database.kw["bind"].sync_engine
    listener = lambda *args: selects.append(args[2])
    event.listen(engine, "before_cursor_execute", listener)
    try:
        await _salvar_turmas(async_database, usuarios[1], historico)
    finally:
        event.remove(engine, "before_cursor_execute", listener)

    assert len([sql for sql in selects if sql.lstrip().startswith("SELECT")]) < 10
    assert len(await _vinculos(async_database, usuarios[1])) == 40
    assert await _contar(async_database, ClassroomModel) == 40
    assert await _contar(async_database, SubjectModel) == 40


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


async def test_aluno_que_some_da_turma_e_trancado(async_database, usuarios):
    await _salvar_turmas(async_database, usuarios[0], [_turma("AAA")])
    classroom_id = (await _vinculos(async_database, usuarios[0]))[0].classroom_id
    eu = _membro("Discente 0", registration="251000000")
    colega = _membro("COLEGA", registration="251000009")
    await _salvar_membros(async_database, classroom_id, [eu, colega])
    assert await _situacoes(async_database, classroom_id) == {
        "Discente 0": (ClassroomStatus.CURSANDO, True, None),
        "COLEGA": (ClassroomStatus.CURSANDO, True, None),
    }

    await _salvar_membros(async_database, classroom_id, [])

    assert await _membros(async_database, classroom_id) == []
    assert await _situacoes(async_database, classroom_id) == {
        "Discente 0": (
            ClassroomStatus.TRANCADO,
            False,
            AGORA,
        ),
        "COLEGA": (
            ClassroomStatus.TRANCADO,
            False,
            AGORA,
        ),
    }
    # O vínculo que veio da lista do próprio usuário continua.
    assert len(await _vinculos(async_database, usuarios[0])) == 1


async def test_aluno_que_saiu_mantem_data_do_trancamento_e_volta_cursando(
    async_database, usuarios
):
    await _salvar_turmas(async_database, usuarios[0], [_turma("AAA")])
    classroom_id = (await _vinculos(async_database, usuarios[0]))[0].classroom_id
    colega = _membro("COLEGA", registration="251000009")
    await _salvar_membros(async_database, classroom_id, [colega])
    await _salvar_membros(async_database, classroom_id, [])

    await _salvar_membros(async_database, classroom_id, [], AGORA + timedelta(days=1))
    assert (await _situacoes(async_database, classroom_id))["COLEGA"] == (
        ClassroomStatus.TRANCADO,
        False,
        AGORA,
    )

    await _salvar_membros(async_database, classroom_id, [colega])
    assert (await _situacoes(async_database, classroom_id))["COLEGA"] == (
        ClassroomStatus.CURSANDO,
        True,
        None,
    )
    assert [l.user.name for l in await _membros(async_database, classroom_id)] == [
        "COLEGA"
    ]


async def test_alunos_de_turma_encerrada_concluem(async_database, usuarios, hoje):
    await _salvar_turmas(async_database, usuarios[0], [_turma("AAA")])
    classroom_id = (await _vinculos(async_database, usuarios[0]))[0].classroom_id
    hoje(date(2026, 12, 19))

    await _salvar_membros(
        async_database, classroom_id, [_membro("Discente 0", registration="251000000")]
    )

    assert await _situacoes(async_database, classroom_id) == {
        "Discente 0": (ClassroomStatus.CONCLUIDO, True, None)
    }
