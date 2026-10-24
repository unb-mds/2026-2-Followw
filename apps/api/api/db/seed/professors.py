import json
from pathlib import Path

from pydantic import TypeAdapter, ValidationError
from sigaa_client import ProfessorDegree
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.models import Professor
from api.db.seed import read_csv, upsert

_DEGREES = TypeAdapter(list[ProfessorDegree])


def _education(value: str) -> str | None:
    if not value.strip():
        return None
    try:
        degrees = json.loads(value)
        if not isinstance(degrees, list) or not degrees:
            raise ValueError
        for degree in _DEGREES.validate_python(degrees):
            if not degree.level.strip():
                raise ValueError
    except (ValueError, ValidationError, TypeError) as exc:
        raise ValueError("Formação inválida no CSV de docentes.") from exc
    return value


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
            unity_id=int(row["unity_id"]),
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
) -> None:
    professors = read_professors(profiles_path)
    await upsert(
        session,
        Professor,
        professors,
        ("siape",),
        (
            "name",
            "unity_id",
            "photo",
            "description",
            "education",
            "interests",
            "lattes",
            "email",
            "disciplines",
        ),
    )
    await session.execute(
        delete(Professor).where(
            Professor.siape.not_in([item.siape for item in professors])
        )
    )
