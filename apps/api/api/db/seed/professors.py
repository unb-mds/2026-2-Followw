import argparse
import asyncio
import json
from pathlib import Path

from pydantic import TypeAdapter, ValidationError
from sigaa_client import ProfessorDegree, lookup_key
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.models import Professor
from api.db.search import lookup_sql
from api.db.seed import read_csv, upsert

_DEGREES = TypeAdapter(list[ProfessorDegree])


def _education(value: str) -> list[dict[str, object]] | None:
    if not value.strip():
        return None
    try:
        degrees = json.loads(value)
        if not isinstance(degrees, list) or not degrees:
            raise ValueError
        validated = _DEGREES.validate_python(degrees)
        for degree in validated:
            if not degree.level.strip():
                raise ValueError
    except (ValueError, ValidationError, TypeError) as exc:
        raise ValueError("Formação inválida no CSV de docentes.") from exc
    return [degree.model_dump() for degree in validated]


def _unique_pairs(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"Disciplina ou semestre repetido: {key}.")
        result[key] = value
    return result


def _disciplines(value: str) -> list[dict[str, object]]:
    grouped = json.loads(value, object_pairs_hook=_unique_pairs)
    if not isinstance(grouped, dict):
        raise TypeError("Disciplinas inválidas no CSV de docentes.")
    disciplines = []
    seen = set()
    for semester, codes in grouped.items():
        if not semester.strip() or not isinstance(codes, dict):
            raise ValueError("Disciplinas inválidas no CSV de docentes.")
        for raw_code, occurrences in codes.items():
            code = raw_code.strip().upper()
            key = (semester.strip(), code)
            if (
                not code
                or type(occurrences) is not int
                or occurrences < 1
                or key in seen
            ):
                raise ValueError(f"Disciplina inválida ou repetida: {key}.")
            seen.add(key)
            disciplines.append(
                {"semester": key[0], "code": code, "occurrences": occurrences}
            )
    return disciplines


def read_professors(profiles_path: Path) -> list[Professor]:
    profiles = read_csv(
        profiles_path,
        lambda row: Professor(
            siape=int(row["siape"]),
            name=row["name"].strip(),
            unit_id=int(row["unit_id"]),
            photo=row["photo"].strip() or None,
            description=row["description"].strip() or None,
            education=_education(row["education"]),
            interests=row["interests"].strip() or None,
            lattes=row["lattes"].strip() or None,
            email=row["email"].strip() or None,
            disciplines=_disciplines(row["disciplines"]),
        ),
        unique=(("siape",),),
    )
    if not profiles:
        raise ValueError("CSV de docentes vazio; catálogo anterior preservado.")
    return profiles


async def seed_professors(
    session: AsyncSession,
    profiles_path: Path,
    *,
    replace_all: bool = False,
) -> None:
    professors = read_professors(profiles_path)
    await _adopt_unlisted(session, professors)
    await upsert(
        session,
        Professor,
        professors,
        ("siape",),
        (
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
    )
    if replace_all:
        await session.execute(
            # Quem veio só das turmas, sem siape, não é do catálogo.
            delete(Professor).where(
                Professor.siape.is_not(None),
                Professor.siape.not_in([item.siape for item in professors]),
            )
        )


async def _adopt_unlisted(session: AsyncSession, professors: list[Professor]) -> None:
    """Dá o siape ao docente de mesmo nome criado pelas turmas, mantendo os vínculos."""
    saved = set(await session.scalars(select(Professor.siape)))
    missing = {
        lookup_key(item.name): item.siape
        for item in professors
        if item.siape not in saved
    }
    if not missing:
        return
    unlisted = await session.scalars(
        select(Professor)
        .where(
            Professor.siape.is_(None),
            lookup_sql(Professor.name).in_(missing),
        )
        .order_by(Professor.created_at)
    )
    for professor in unlisted:
        professor.siape = missing.pop(lookup_key(professor.name), None)
    await session.flush()


def main() -> None:
    parser = argparse.ArgumentParser(description="Carrega o catálogo CSV de docentes.")
    parser.add_argument("csv", type=Path)
    parser.add_argument(
        "--replace-all",
        action="store_true",
        help="Remove docentes ausentes do CSV; use somente com uma coleta completa.",
    )
    args = parser.parse_args()

    async def load() -> None:
        from api.db.main import async_session

        async with async_session.begin() as session:
            await seed_professors(session, args.csv, replace_all=args.replace_all)

    asyncio.run(load())
