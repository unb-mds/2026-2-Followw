import pytest
from sqlalchemy import select

from api.db.models import Subject, Unity
from api.db.seed.subjects import (
    SUBJECTS_CSV,
    parse_requirements,
    read_subjects,
    seed_subjects,
)
from api.db.seed.unities import UNITIES_CSV, read_unities
from api.modules.public_classrooms.repository import UnitIndexRepository


def _csv(tmp_path, *lines):
    path = tmp_path / "subjects.csv"
    path.write_text(
        "code,name,hours,unity_id,prerequisites,corequisites,equivalences,catalog_complete\n"
        + "\n".join(line + ",true" for line in lines)
        + "\n",
        encoding="utf-8",
    )
    return path


def test_csv_do_repositorio_aponta_para_unidades_que_existem():
    unities = {unity.id for unity in read_unities(UNITIES_CSV)}
    subjects = read_subjects(SUBJECTS_CSV)

    assert {s.unity_id for s in subjects if s.unity_id is not None} <= unities
    assert all(s.hours for s in subjects)
    assert any(s.prerequisites for s in subjects)


def test_catalogo_inclui_nomes_dos_requisitos_sem_oferta():
    subjects = {subject.code: subject for subject in read_subjects(SUBJECTS_CSV)}

    assert subjects["IQD0051"].name == "QUÍMICA GERAL"
    assert subjects["FGA0138"].name == "MÉTODOS DE DESENVOLVIMENTO DE SOFTWARE"


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
    (subject,) = read_subjects(_csv(tmp_path, 'A1,NOME,,,"( ( X ) )",,( Y OU Z )'))
    assert (subject.hours, subject.unity_id, subject.corequisites) == (None, None, None)
    assert (subject.prerequisites, subject.equivalences) == ([["X"]], [["Y"], ["Z"]])

    with pytest.raises(ValueError, match="repetido"):
        read_subjects(_csv(tmp_path, "A1,A,60,1,,,", "A1,B,60,1,,,"))


async def test_seed_atualiza_pelo_codigo_e_nao_duplica(async_database, tmp_path):
    async with async_database.begin() as session:
        await seed_subjects(session, _csv(tmp_path, "FGA0001,ANTIGO,30,673,,,"))
    async with async_database.begin() as session:
        await seed_subjects(
            session, _csv(tmp_path, 'FGA0001,NOVO,60,673,"( ( A E B ) OU ( C ) )",,')
        )

    async with async_database() as session:
        (subject,) = (await session.scalars(select(Subject))).all()
    assert (subject.name, subject.hours, subject.unity_id) == ("NOVO", 60, 673)
    assert subject.prerequisites == [["A", "B"], ["C"]]


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


def test_certificacao_explicita_sem_inferencia(tmp_path):
    path = _csv(tmp_path, "A,NOME,60,673,,,")
    (complete,) = read_subjects(path)
    assert complete.catalog_complete is True
    path.write_text(path.read_text().replace(",true", ",false"))
    (partial,) = read_subjects(path)
    assert partial.catalog_complete is False
    path.write_text(path.read_text().replace(",false", ",unknown"))
    with pytest.raises(ValueError, match="catalog_complete"):
        read_subjects(path)


def test_certificacao_dataset_corresponde_a_proveniencia():
    for subject in read_subjects(SUBJECTS_CSV):
        if subject.catalog_complete:
            assert (
                subject.code and subject.name and subject.hours > 0 and subject.unity_id
            )
        else:
            assert subject.unity_id is None
            assert (
                subject.prerequisites
                is subject.corequisites
                is subject.equivalences
                is None
            )
