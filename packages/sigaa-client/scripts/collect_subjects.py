"""Coleta os componentes de graduação ofertados, unidade a unidade, com requisitos."""

import asyncio

from _by_unit import (
    DATA_DIR,
    collect_by_unit,
    load_units,
    parse_args,
    parse_semester,
    write_csv,
)

from sigaa_client import SigaaPublicClient, SubjectDetails, TeachingLevel, Unit

OUTPUT = DATA_DIR / "subjects.csv"
COLUMNS = (
    "code",
    "name",
    "hours",
    "unity_id",
    "prerequisites",
    "corequisites",
    "equivalences",
)
DETAIL_DELAY = 0.3


async def collect_subjects(
    semester: str | None = None, only: list[str] | None = None, workers: int = 2
) -> list[tuple[int, SubjectDetails]]:
    year, period = parse_semester(semester)
    units = await load_units(only)

    # Uma nova tentativa da unidade não perde o que já foi aberto.
    progress: dict[int, dict[str, SubjectDetails]] = {}

    async def collect_unit(
        client: SigaaPublicClient, unit: Unit
    ) -> dict[str, SubjectDetails]:
        found = progress.setdefault(unit.id, {})
        async for subject in client.classrooms.iter_subjects(
            unit,
            level=TeachingLevel.GRADUACAO,
            year=year,
            period=period,
            skip=found.keys(),
        ):
            found[subject.code] = subject
            await asyncio.sleep(DETAIL_DELAY)
        return found

    found_by_unit = await collect_by_unit(
        units, collect_unit, lambda found: f"{len(found)} componentes", workers
    )

    # Componente ofertado por mais de uma unidade fica com a de menor id.
    subjects: dict[str, tuple[int, SubjectDetails]] = {}
    shared: set[str] = set()
    for unit_id, found in sorted(found_by_unit.items()):
        for code, subject in found.items():
            if code in subjects:
                shared.add(code)
            else:
                subjects[code] = (unit_id, subject)
    if not subjects:
        raise RuntimeError("Nenhum componente encontrado; nada foi salvo.")

    empty = sum(1 for found in found_by_unit.values() if not found)
    print(f"Unidades sem componentes: {empty} de {len(units)}.")
    print(f"Componentes em mais de uma unidade: {len(shared)}.")
    return [(unit_id, subject) for _, (unit_id, subject) in sorted(subjects.items())]


def subject_rows(
    subjects: list[tuple[int, SubjectDetails]],
) -> list[dict[str, object]]:
    return [
        subject.model_dump() | {"unity_id": unity_id} for unity_id, subject in subjects
    ]


def main():
    args = parse_args(__doc__, OUTPUT)
    subjects = asyncio.run(collect_subjects(args.semester, args.unit, args.workers))
    write_csv(subject_rows(subjects), COLUMNS, args.output)
    print(f"Salvo em {args.output}: {len(subjects)} componentes.")


if __name__ == "__main__":
    main()
