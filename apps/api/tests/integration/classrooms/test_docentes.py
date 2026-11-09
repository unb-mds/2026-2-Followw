from sigaa_client import ClassroomRole

from api.db.models import Professor
from api.db.professors import SeenProfessor, _complete, save_professors

from .helpers import (
    _contar,
    _docentes,
    _membro,
    _salvar_membros,
    _salvar_turmas,
    _turma,
    _vinculos,
)


async def test_docente_fora_do_catalogo_e_criado_e_atualizado_pela_turma(
    async_database, usuarios
):
    await _salvar_turmas(async_database, usuarios[0], [_turma("AAA")])
    classroom_id = (await _vinculos(async_database, usuarios[0]))[0].classroom_id
    docente = _membro(
        "NOME DOCENTE",
        role=ClassroomRole.PROFESSOR,
        person_id=42,
        photo="a.jpg",
        unit="CAMPUS UNB GAMA: FCTE",
    )

    await _salvar_membros(async_database, classroom_id, [docente])
    await _salvar_membros(
        async_database, classroom_id, [docente.model_copy(update={"photo": "b.jpg"})]
    )

    (achado,) = await _docentes(async_database, classroom_id)
    assert (achado.siape, achado.person_id, achado.photo, achado.unit_id) == (
        None,
        42,
        "b.jpg",
        673,
    )
    assert await _contar(async_database, Professor) == 1


async def test_docente_casa_com_o_catalogo_pelo_email_e_so_completa(
    async_database, usuarios
):
    async with async_database() as session:
        session.add(
            Professor(
                siape=1, name="MARIA DA SILVA", unit_id=673, email="m@unb.br", photo="c"
            )
        )
        await session.commit()
    await _salvar_turmas(
        async_database, usuarios[0], [_turma("AAA"), _turma("BBB", "FGA0158")]
    )
    links = await _vinculos(async_database, usuarios[0])
    docente = _membro(
        "MARIA S.", role=ClassroomRole.PROFESSOR, email="M@unb.br", person_id=42
    )

    await _salvar_membros(
        async_database,
        links[0].classroom_id,
        [docente.model_copy(update={"photo": "s"})],
    )
    # Na outra turma, só o `idPessoa` identifica o mesmo docente.
    await _salvar_membros(
        async_database,
        links[1].classroom_id,
        [_membro("OUTRO NOME", role=ClassroomRole.PROFESSOR, person_id=42)],
    )

    for link in links:
        (achado,) = await _docentes(async_database, link.classroom_id)
        assert (achado.siape, achado.name, achado.person_id, achado.photo) == (
            1,
            "MARIA DA SILVA",
            42,
            "c",
        )
    assert await _contar(async_database, Professor) == 1


async def test_docente_casa_com_o_catalogo_pelo_nome_sem_acento_nem_caixa(
    async_database, usuarios
):
    async with async_database() as session:
        session.add(Professor(siape=1, name="José  Araújo", unit_id=673))
        await session.commit()
    await _salvar_turmas(async_database, usuarios[0], [_turma("AAA")])
    classroom_id = (await _vinculos(async_database, usuarios[0]))[0].classroom_id

    await _salvar_membros(
        async_database,
        classroom_id,
        [_membro("JOSE ARAUJO", role=ClassroomRole.PROFESSOR, email="j@unb.br")],
    )

    (achado,) = await _docentes(async_database, classroom_id)
    assert (achado.siape, achado.email) == (1, "j@unb.br")


async def test_docente_nao_completa_email_pessoal_da_turma(async_database, usuarios):
    async with async_database() as session:
        session.add(Professor(siape=1, name="José Araújo", unit_id=673))
        await session.commit()
    await _salvar_turmas(async_database, usuarios[0], [_turma("AAA")])
    classroom_id = (await _vinculos(async_database, usuarios[0]))[0].classroom_id

    await _salvar_membros(
        async_database,
        classroom_id,
        [_membro("JOSE ARAUJO", role=ClassroomRole.PROFESSOR, email="j@gmail.com")],
    )

    (achado,) = await _docentes(async_database, classroom_id)
    assert achado.email is None

    async with async_database() as session:
        (completado,) = await save_professors(
            session, [SeenProfessor(name="JOSE ARAUJO", email="j@hotmail.com")]
        )
        assert completado.email is None

        (institucional,) = await save_professors(
            session, [SeenProfessor(name="JOSE ARAUJO", email="j@unb.br")]
        )
        assert institucional.email == "j@unb.br"


def test_complete_professores_rejeita_email_nao_institucional():
    professor = Professor(siape=1, name="DOCENTE")
    seen_pessoal = SeenProfessor(name="DOCENTE", email="docente@gmail.com")
    _complete(professor, seen_pessoal)
    assert professor.email is None

    seen_institucional = SeenProfessor(name="DOCENTE", email="docente@unb.br")
    _complete(professor, seen_institucional)
    assert professor.email == "docente@unb.br"

    seen_subdominio = SeenProfessor(name="DOCENTE", email="docente@mat.unb.br")
    professor_sub = Professor(siape=2, name="DOCENTE 2")
    _complete(professor_sub, seen_subdominio)
    assert professor_sub.email == "docente@mat.unb.br"


def test_complete_preserva_email_pessoal_vindo_do_catalogo_publico():
    professor = Professor(siape=1, name="DOCENTE", email="docente@gmail.com")

    _complete(professor, SeenProfessor(name="DOCENTE", email="docente@unb.br"))

    assert professor.email == "docente@gmail.com"


def test_complete_nao_troca_person_id_de_docente_fora_do_catalogo():
    professor = Professor(name="DOCENTE", person_id=10)

    _complete(professor, SeenProfessor(name="DOCENTE", person_id=20))

    assert professor.person_id == 10


async def test_docente_repetido_na_listagem_vira_um_so(async_database, usuarios):
    await _salvar_turmas(async_database, usuarios[0], [_turma("AAA")])
    classroom_id = (await _vinculos(async_database, usuarios[0]))[0].classroom_id
    docente = _membro("DOCENTE", role=ClassroomRole.PROFESSOR, email="d@unb.br")

    await _salvar_membros(
        async_database,
        classroom_id,
        [docente, docente.model_copy(update={"person_id": 42})],
    )

    (achado,) = await _docentes(async_database, classroom_id)
    assert achado.person_id == 42
    assert await _contar(async_database, Professor) == 1


async def test_docente_que_saiu_da_turma_perde_o_vinculo(async_database, usuarios):
    await _salvar_turmas(async_database, usuarios[0], [_turma("AAA")])
    classroom_id = (await _vinculos(async_database, usuarios[0]))[0].classroom_id
    eu = _membro("Discente 0", registration="251000000")
    docente = _membro("DOCENTE", role=ClassroomRole.PROFESSOR, email="d@unb.br")

    await _salvar_membros(async_database, classroom_id, [eu, docente])
    assert [d.name for d in await _docentes(async_database, classroom_id)] == [
        "DOCENTE"
    ]
    await _salvar_membros(async_database, classroom_id, [eu])

    assert await _docentes(async_database, classroom_id) == []
    # O docente segue em `professors` para as outras turmas.
    assert await _contar(async_database, Professor) == 1
