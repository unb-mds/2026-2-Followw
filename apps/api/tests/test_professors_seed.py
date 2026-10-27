import csv

import pytest
from sqlalchemy import func, select

from api.db.models import Professor
from api.db.seed.professors import read_professors, seed_professors


def _csv(path, columns, rows):
    with path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, columns)
        writer.writeheader()
        writer.writerows(rows)


def _files(tmp_path):
    profiles = tmp_path / "professors.csv"
    _csv(
        profiles,
        (
            "siape",
            "name",
            "unit_id",
            "photo",
            "description",
            "education",
            "interests",
            "lattes",
            "email",
            "disciplines",
        ),
        [
            {
                "siape": 123,
                "name": "MARIA",
                "unit_id": 673,
                "photo": "",
                "description": "Pesquisa sistemas.",
                "education": '[{"level":"GRADUAÇÃO","start_year":"2018","end_year":"2021","course":"Computação","institution":"Universidade Estadual de Goiás"}]',
                "interests": "Computação",
                "lattes": "",
                "email": "maria@unb.br",
                "disciplines": '{"2026.2":{"FGA0001":2}}',
            }
        ],
    )
    return profiles


def test_csv_relaciona_disciplinas_ao_siape(tmp_path):
    profiles = _files(tmp_path)
    (professor,) = read_professors(profiles)
    assert professor.disciplines == [
        {"semester": "2026.2", "code": "FGA0001", "occurrences": 2}
    ]
    with profiles.open("r", encoding="utf-8", newline="") as file:
        row = next(csv.DictReader(file))
    row["disciplines"] = '{"2026.2":{"FGA0001":2,"FGA0001":1}}'
    _csv(profiles, row.keys(), [row])
    with pytest.raises(ValueError, match="repetido"):
        read_professors(profiles)


def test_formacao_precisa_ser_lista_de_titulacoes(tmp_path):
    profiles = _files(tmp_path)
    with profiles.open("r", encoding="utf-8", newline="") as file:
        row = next(csv.DictReader(file))
    row["education"] = '{"doutorado":"Física"}'
    _csv(profiles, row.keys(), [row])
    with pytest.raises(ValueError, match="Formação inválida"):
        read_professors(profiles)


async def test_seed_atualiza_perfil_e_disciplinas(async_database, tmp_path):
    profiles = _files(tmp_path)
    async with async_database.begin() as session:
        await seed_professors(session, profiles)
        professor = await session.scalar(
            select(Professor).where(Professor.siape == 123)
        )
        assert professor is not None
        professor_id = professor.id
        professor.description = "Descrição antiga"
        professor.education = []
        professor.interests = "Interesses antigos"
    with profiles.open("r", encoding="utf-8", newline="") as file:
        row = next(csv.DictReader(file))
    row["disciplines"] = '{"2026.1":{"FGA0002":1}}'
    _csv(profiles, row.keys(), [row])
    async with async_database.begin() as session:
        await seed_professors(session, profiles)
    async with async_database() as session:
        professor = await session.scalar(
            select(Professor).where(Professor.siape == 123)
        )
        assert professor.id == professor_id
        assert professor.description == "Pesquisa sistemas."
        assert professor.education == [
            {
                "level": "GRADUAÇÃO",
                "start_year": "2018",
                "end_year": "2021",
                "course": "Computação",
                "institution": "Universidade Estadual de Goiás",
            }
        ]
        assert professor.interests == "Computação"
        assert professor.disciplines == [
            {"semester": "2026.1", "code": "FGA0002", "occurrences": 1}
        ]


async def test_csv_vazio_nao_apaga_catalogo(async_database, tmp_path):
    profiles = _files(tmp_path)
    async with async_database.begin() as session:
        await seed_professors(session, profiles)
    _csv(
        profiles,
        (
            "siape",
            "name",
            "unit_id",
            "photo",
            "description",
            "education",
            "interests",
            "lattes",
            "email",
            "disciplines",
        ),
        [],
    )
    async with async_database.begin() as session:
        with pytest.raises(ValueError, match="CSV de docentes vazio"):
            await seed_professors(session, profiles)
    async with async_database() as session:
        assert (
            await session.scalar(select(Professor).where(Professor.siape == 123))
            is not None
        )


async def test_formacao_ausente_e_null_no_banco(async_database, tmp_path):
    profiles = _files(tmp_path)
    with profiles.open("r", encoding="utf-8", newline="") as file:
        row = next(csv.DictReader(file))
    row["education"] = ""
    _csv(profiles, row.keys(), [row])
    async with async_database.begin() as session:
        await seed_professors(session, profiles)
    async with async_database() as session:
        count = await session.scalar(
            select(func.count())
            .select_from(Professor)
            .where(Professor.education.is_(None))
        )
    assert count == 1


async def test_carga_parcial_preserva_outros_docentes_e_substituicao_remove(
    async_database, tmp_path
):
    profiles = _files(tmp_path)
    with profiles.open("r", encoding="utf-8", newline="") as file:
        row = next(csv.DictReader(file))
    other = {**row, "siape": 456, "name": "JOÃO"}
    _csv(profiles, row.keys(), [row, other])
    async with async_database.begin() as session:
        await seed_professors(session, profiles)

    _csv(profiles, row.keys(), [row])
    async with async_database.begin() as session:
        await seed_professors(session, profiles)
    async with async_database() as session:
        assert await session.scalar(select(Professor).where(Professor.siape == 456))

    async with async_database.begin() as session:
        await seed_professors(session, profiles, replace_all=True)
    async with async_database() as session:
        assert (
            await session.scalar(select(Professor).where(Professor.siape == 456))
            is None
        )
