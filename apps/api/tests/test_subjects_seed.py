import pytest
from sqlalchemy import select

from api.db.models import Subject, Unity
from api.db.seed.subjects import SUBJECTS_CSV, read_subjects, seed_subjects
from api.db.seed.unities import UNITIES_CSV, read_unities
from api.modules.public_classrooms.repository import UnitIndexRepository


def _csv(tmp_path, *lines):
    path = tmp_path / "subjects.csv"
    path.write_text(
        "code,name,hours,unity_id,prerequisites,corequisites,equivalences\n"
        + "\n".join(lines)
        + "\n",
        encoding="utf-8",
    )
    return path


def test_csv_do_repositorio_aponta_para_unidades_que_existem():
    unities = {unity.id for unity in read_unities(UNITIES_CSV)}
    subjects = read_subjects(SUBJECTS_CSV)

    assert {s.unity_id for s in subjects} <= unities
    assert all(s.hours for s in subjects)


def test_campos_vazios_ficam_nulos_e_codigo_repetido_e_barulhento(tmp_path):
    (subject,) = read_subjects(_csv(tmp_path, 'A1,NOME,,,"( ( X ) )",,'))
    assert (subject.hours, subject.unity_id) == (None, None)

    with pytest.raises(ValueError, match="repetido"):
        read_subjects(_csv(tmp_path, "A1,A,60,1,,,", "A1,B,60,1,,,"))


async def test_seed_atualiza_pelo_codigo_e_nao_duplica(async_database, tmp_path):
    async with async_database.begin() as session:
        await seed_subjects(session, _csv(tmp_path, "FGA0001,ANTIGO,30,673,,,"))
    async with async_database.begin() as session:
        await seed_subjects(session, _csv(tmp_path, "FGA0001,NOVO,60,673,,,"))

    async with async_database() as session:
        (subject,) = (await session.scalars(select(Subject))).all()
    assert (subject.name, subject.hours, subject.unity_id) == ("NOVO", 60, 673)


async def test_indice_acha_as_unidades_pelo_prefixo_e_ignora_prefixo_maior(
    async_database,
):
    async with async_database.begin() as session:
        session.add(Unity(id=518, code="MAT", name="DEPTO MATEMÁTICA"))
        session.add_all(
            [
                Subject(code="FGA0030", name="A", unity_id=673),
                Subject(code="FGA0031", name="B", unity_id=673),
                Subject(code="FGA0032", name="C", unity_id=518),
                Subject(code="FGAX0001", name="D", unity_id=518),
                Subject(code="FGA0099", name="Sem unidade"),
            ]
        )

    async with async_database() as session:
        repository = UnitIndexRepository(session)
        assert await repository.unit_ids("FGA") == [518, 673]
        assert await repository.unit_ids("NOVO") == []
        assert await repository.unit_names([518, 673]) == {
            518: "DEPTO MATEMÁTICA",
            673: "CAMPUS UNB GAMA",
        }
