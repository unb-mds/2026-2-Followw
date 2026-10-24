import csv

import pytest

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
            "department_id",
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
                "department_id": 673,
                "photo": "",
                "description": "",
                "education": "",
                "interests": "",
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


async def test_seed_atualiza_perfil_e_disciplinas(async_database, tmp_path):
    profiles = _files(tmp_path)
    async with async_database.begin() as session:
        await seed_professors(session, profiles)
        professor = await session.get(Professor, 123)
        assert professor is not None
        professor.url = "https://sigaa.unb.br/perfil-antigo"
    with profiles.open("r", encoding="utf-8", newline="") as file:
        row = next(csv.DictReader(file))
    row["disciplines"] = '{"2026.1":{"FGA0002":1}}'
    _csv(profiles, row.keys(), [row])
    async with async_database.begin() as session:
        await seed_professors(session, profiles)
    async with async_database() as session:
        professor = await session.get(Professor, 123)
        assert professor.url == ""
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
            "department_id",
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
        assert await session.get(Professor, 123) is not None
