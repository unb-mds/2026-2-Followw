import pytest
from sqlalchemy import select

from api.db.models import Classroom, Subject
from api.db.seed.classrooms import CLASSROOMS_CSV, read_classrooms, seed_classrooms
from api.db.seed.subjects import SUBJECTS_CSV, read_subjects


def _csv(tmp_path, *lines):
    path = tmp_path / "classrooms.csv"
    path.write_text(
        "subject_code,number,semester,schedule,room,vacancies,occupied,teachers\n"
        + "\n".join(lines)
        + "\n",
        encoding="utf-8",
    )
    return path


def test_csv_do_repositorio_aponta_para_componentes_que_existem():
    subjects = {subject.code for subject in read_subjects(SUBJECTS_CSV)}
    classrooms = read_classrooms(CLASSROOMS_CSV)

    assert classrooms
    assert {c.subject_code for c in classrooms} <= subjects


def test_campos_vazios_ficam_nulos_e_turma_repetida_e_barulhenta(tmp_path):
    (classroom,) = read_classrooms(_csv(tmp_path, " fga0001 ,01,2026.2,,,,,"))
    assert classroom.subject_code == "FGA0001"
    assert (classroom.schedule, classroom.room) == (None, None)
    assert (classroom.professors, classroom.vacancies, classroom.occupied) == (
        [],
        None,
        None,
    )

    # Mesmo número em outro componente ou semestre é outra turma.
    read_classrooms(
        _csv(
            tmp_path,
            "FGA0001,01,2026.2,,,,,",
            "FGA0002,01,2026.2,,,,,",
            "FGA0001,01,2026.1,,,,,",
        )
    )
    with pytest.raises(ValueError, match="repetido"):
        read_classrooms(
            _csv(tmp_path, "fga0001,01,2026.2,,,,,", "FGA0001,01,2026.2,,,,,")
        )


async def test_seed_atualiza_so_docentes_e_vagas_e_ignora_componente_desconhecido(
    async_database, tmp_path
):
    async with async_database.begin() as session:
        session.add(Subject(code="FGA0001", name="A", unity_id=673))
    async with async_database.begin() as session:
        await seed_classrooms(
            session,
            _csv(
                tmp_path,
                "FGA0001,01,2026.2,35M12,S1,50,10,FULANO; CICLANO",
                "XYZ9999,01,2026.2,24T23,S2,50,10,",
            ),
        )
    async with async_database.begin() as session:
        await seed_classrooms(
            session,
            _csv(
                tmp_path,
                "FGA0001,01,2026.2,46T23,S9,60,12,BELTRANO",
                "FGA0001,02,2026.2,24T23,,50,10,",
            ),
        )

    async with async_database() as session:
        classrooms = (
            await session.scalars(select(Classroom).order_by(Classroom.number))
        ).all()
    assert [
        (c.number, c.schedule, c.room, c.professors, c.vacancies, c.occupied)
        for c in classrooms
    ] == [
        ("01", "35M12", "S1", ["BELTRANO"], 60, 12),
        ("02", "24T23", None, [], 50, 10),
    ]


async def test_turmas_de_componente_desconhecido_sao_contadas_no_log(
    async_database, tmp_path, monkeypatch
):
    events = []
    monkeypatch.setattr(
        "api.db.seed.classrooms.event", lambda name, **fields: events.append(fields)
    )
    async with async_database.begin() as session:
        await seed_classrooms(
            session,
            _csv(tmp_path, "XYZ9999,01,2026.2,,,,,", "XYZ9998,01,2026.2,,,,,"),
        )

    assert [e["skipped_count"] for e in events] == [2]
