import pytest
from sqlalchemy import select

from api.db.models import Subject, Unit
from api.db.seed.subjects import (
    SUBJECTS_CSV,
    parse_requirements,
    read_subjects,
    seed_subjects,
)
from api.db.seed.units import UNITS_CSV, read_units
from api.modules.public_classrooms.repository import UnitIndexRepository


def _csv(tmp_path, *lines):
    path = tmp_path / "subjects.csv"
    path.write_text(
        "code,name,hours,unit_id,prerequisites,corequisites,equivalences\n"
        + "\n".join(lines)
        + "\n",
        encoding="utf-8",
    )
    return path


def test_csv_do_repositorio_aponta_para_unidades_que_existem():
    units = {unit.id for unit in read_units(UNITS_CSV)}
    subjects = read_subjects(SUBJECTS_CSV)

    assert {s.unit_id for s in subjects if s.unit_id is not None} <= units
    assert all(s.hours for s in subjects)
    assert any(s.prerequisites for s in subjects)


def test_catalogo_inclui_nomes_dos_requisitos_sem_oferta():
    subjects = {subject.code: subject for subject in read_subjects(SUBJECTS_CSV)}

    assert subjects["IQD0051"].name == "QUÍMICA GERAL"
    assert subjects["FGA0138"].name == "MÉTODOS DE DESENVOLVIMENTO DE SOFTWARE"


async def test_seed_preserva_materia_do_banco_ausente_no_csv(async_database, tmp_path):
    async with async_database.begin() as session:
        session.add(
            Subject(
                code="FGA0288",
                name="ESTÁGIO SUPERVISIONADO",
                hours=210,
                unit_id=673,
                prerequisites=[["FGA0001"]],
            )
        )
    async with async_database.begin() as session:
        await seed_subjects(session, _csv(tmp_path, "FGA0001,INTRODUÇÃO,60,673,,,"))

    async with async_database() as session:
        subject = await session.get(Subject, "FGA0288")
        assert subject is not None
        assert (subject.name, subject.hours, subject.unit_id) == (
            "ESTÁGIO SUPERVISIONADO",
            210,
            673,
        )
        assert subject.prerequisites == [["FGA0001"]]


@pytest.mark.parametrize(
    ("expression", "expected"),
    [
        ("", None),
        ("( ( CIC0004 ) )", [["CIC0004"]]),
        ("( ( X E Y ) OU ( Z ) )", [["X", "Y"], ["Z"]]),
        ("( A E B E C )", [["A", "B", "C"]]),
        (
            "( ( A OU B ) E ( C OU D ) )",
            [["A", "C"], ["A", "D"], ["B", "C"], ["B", "D"]],
        ),
        ("( A E B OU C )", [["A", "B"], ["C"]]),
        ("( ( A ) OU ( A ) OU ( A E A ) )", [["A"]]),
    ],
)
def test_requisitos_viram_ou_de_es(expression, expected):
    assert parse_requirements(expression) == expected


@pytest.mark.parametrize("expression", ["( A", "( A ) )", "( A E )", "( OU A )", "A B"])
def test_requisito_malformado_e_barulhento(expression):
    with pytest.raises(ValueError, match="malformado"):
        parse_requirements(expression)


def test_campos_vazios_ficam_nulos_e_codigo_repetido_e_barulhento(tmp_path):
    (subject,) = read_subjects(_csv(tmp_path, ' a1 ,NOME,,,"( ( x ) )",,( y OU Z )'))
    assert subject.code == "A1"
    assert (subject.hours, subject.unit_id, subject.corequisites) == (None, None, None)
    assert (subject.prerequisites, subject.equivalences) == ([["X"]], [["Y"], ["Z"]])

    with pytest.raises(ValueError, match="repetido"):
        read_subjects(_csv(tmp_path, "a1,A,60,1,,,", "A1,B,60,1,,,"))


async def test_seed_atualiza_pelo_codigo_e_nao_duplica(async_database, tmp_path):
    async with async_database.begin() as session:
        await seed_subjects(session, _csv(tmp_path, "FGA0001,ANTIGO,30,673,,,"))
    async with async_database.begin() as session:
        await seed_subjects(
            session, _csv(tmp_path, 'FGA0001,NOVO,60,673,"( ( A E B ) OU ( C ) )",,')
        )

    async with async_database() as session:
        (subject,) = (await session.scalars(select(Subject))).all()
    assert (subject.name, subject.hours, subject.unit_id) == ("NOVO", 60, 673)
    assert subject.prerequisites == [["A", "B"], ["C"]]


async def test_indice_acha_as_unidades_pelo_prefixo_e_ignora_prefixo_maior(
    async_database,
):
    async with async_database.begin() as session:
        session.add(Unit(id=518, code="MAT", name="DEPTO MATEMÁTICA"))
        session.add_all(
            [
                Subject(code="FGA0030", name="A", unit_id=673),
                Subject(code="FGA0031", name="B", unit_id=673),
                Subject(code="FGA0032", name="C", unit_id=518),
                Subject(code="FGAX0001", name="D", unit_id=518),
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
