"""Coleta as turmas de graduação do semestre, unidade a unidade."""

import argparse
import asyncio
from collections.abc import Mapping, Sequence
from pathlib import Path

from _by_unit import (
    DATA_DIR,
    collect_by_unit,
    load_units,
    parse_semester,
    write_csv,
)

from sigaa_client import PublicClassroom, SigaaPublicClient, TeachingLevel, Unit

OUTPUT = DATA_DIR / "classrooms.csv"
COLUMNS = (
    "subject_code",
    "number",
    "semester",
    "schedule",
    "room",
    "unity_id",
    "vacancies",
    "occupied",
    "teachers",
)
TEACHER_SEPARATOR = "; "


async def collect_classrooms(
    semester: str | None = None, only: list[str] | None = None, workers: int = 2
) -> list[dict[str, object]]:
    year, period = parse_semester(semester)
    units = await load_units(only)

    async def collect_unit(
        client: SigaaPublicClient, unit: Unit
    ) -> list[PublicClassroom]:
        return await client.classrooms.search(
            unit, level=TeachingLevel.GRADUACAO, year=year, period=period
        )

    found_by_unit = await collect_by_unit(
        units, collect_unit, lambda found: f"{len(found)} turmas", workers
    )
    rows = classroom_rows(found_by_unit)
    if not rows:
        raise RuntimeError("Nenhuma turma encontrada; nada foi salvo.")

    empty = sum(1 for found in found_by_unit.values() if not found)
    print(f"Unidades sem turmas: {empty} de {len(units)}.")
    return rows


def classroom_rows(
    found_by_unit: Mapping[int, Sequence[PublicClassroom]],
) -> list[dict[str, object]]:
    """Uma linha por turma; a que aparece em mais de uma unidade fica com a de menor id."""
    rows: dict[tuple[str, str, str], dict[str, object]] = {}
    shared = 0
    for unit_id, classrooms in sorted(found_by_unit.items()):
        for classroom in classrooms:
            code = classroom.subject.code
            if code is None:
                continue
            key = (code, classroom.number, classroom.semester)
            if key in rows:
                shared += 1
                continue
            rows[key] = {
                "subject_code": code,
                "number": classroom.number,
                "semester": classroom.semester,
                "schedule": classroom.schedule,
                "room": classroom.room,
                "unity_id": unit_id,
                "vacancies": classroom.vacancies,
                "occupied": classroom.occupied,
                "teachers": TEACHER_SEPARATOR.join(t.name for t in classroom.teachers),
            }
    if shared:
        print(f"Turmas em mais de uma unidade: {shared}.")
    return [rows[key] for key in sorted(rows)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--semester", help="AAAA.P; omitido usa o formulário do SIGAA.")
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument(
        "--unit", action="append", help="id ou nome exato de uma unidade (repetível)."
    )
    parser.add_argument("--workers", type=int, default=2)
    args = parser.parse_args()
    try:
        parse_semester(args.semester)
    except ValueError as error:
        parser.error(f"--semester: {error}")

    rows = asyncio.run(collect_classrooms(args.semester, args.unit, args.workers))
    write_csv(rows, COLUMNS, args.output)
    print(f"Salvo em {args.output}: {len(rows)} turmas.")


if __name__ == "__main__":
    main()
