"""Coleta os componentes de graduação ofertados, unidade a unidade, com requisitos."""

import argparse
import asyncio
import csv
import re
from pathlib import Path

import httpx

from sigaa_client import (
    SigaaError,
    SigaaPublicClient,
    SubjectDetails,
    TeachingLevel,
    Unit,
)

OUTPUT = Path(__file__).resolve().parents[1] / "data" / "subjects.csv"
COLUMNS = (
    "code",
    "name",
    "hours",
    "unity_id",
    "prerequisites",
    "corequisites",
    "equivalences",
)
ATTEMPTS = 3
DETAIL_DELAY = 0.3
UNIT_DELAY = 0.5


async def collect_subjects(
    semester: str | None = None, only: list[str] | None = None, workers: int = 2
) -> list[tuple[int, SubjectDetails]]:
    year, period = map(int, semester.split(".")) if semester else (None, None)
    async with SigaaPublicClient(timeout=45) as client:
        units = await client.classrooms.list_units()
    if not units:
        raise RuntimeError("O SIGAA não retornou unidades.")
    if only:
        wanted = {name.casefold() for name in only}
        units = [u for u in units if wanted & {str(u.id), u.name.casefold()}]
        if not units:
            raise RuntimeError(f"Nenhuma unidade casa com {only}.")

    found_by_unit: dict[int, dict[str, SubjectDetails]] = {}
    failed: list[int] = []
    queue: asyncio.Queue[Unit] = asyncio.Queue()
    for unit in units:
        queue.put_nowait(unit)

    async def collect_unit(
        client: SigaaPublicClient, unit: Unit
    ) -> dict[str, SubjectDetails]:
        found: dict[str, SubjectDetails] = {}
        # Uma falha no meio da unidade não perde o que já foi aberto.
        for attempt in range(ATTEMPTS):
            try:
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
            except (SigaaError, httpx.HTTPError) as error:
                if attempt == ATTEMPTS - 1:
                    raise
                print(f"Nova tentativa {unit.id}: {error}", flush=True)
                await asyncio.sleep(2)
        return found

    async def worker():
        async with SigaaPublicClient(timeout=45) as client:
            while not queue.empty():
                unit = queue.get_nowait()
                try:
                    found_by_unit[unit.id] = await collect_unit(client, unit)
                except (SigaaError, httpx.HTTPError) as error:
                    failed.append(unit.id)
                    print(f"Falha {unit.id}: {error}", flush=True)
                    continue
                print(
                    f"{unit.id} ({unit.name}): {len(found_by_unit[unit.id])} componentes",
                    flush=True,
                )
                await asyncio.sleep(UNIT_DELAY)

    await asyncio.gather(*(worker() for _ in range(workers)))
    if failed:
        raise RuntimeError(f"Unidades com falha: {sorted(failed)}; nada foi salvo.")

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


def write_csv(subjects: list[tuple[int, SubjectDetails]], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    with temporary.open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(
            file, COLUMNS, extrasaction="ignore", lineterminator="\n"
        )
        writer.writeheader()
        for unity_id, subject in subjects:
            row = subject.model_dump() | {"unity_id": unity_id}
            writer.writerow({column: row[column] for column in COLUMNS})
    temporary.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--semester", help="AAAA.P; omitido usa o formulário do SIGAA.")
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument(
        "--unit", action="append", help="id ou nome exato de uma unidade (repetível)."
    )
    parser.add_argument("--workers", type=int, default=2)
    args = parser.parse_args()
    if args.semester and not re.fullmatch(r"[0-9]{4}\.[0-9]", args.semester):
        parser.error("--semester deve usar o formato AAAA.P")

    subjects = asyncio.run(collect_subjects(args.semester, args.unit, args.workers))
    write_csv(subjects, args.output)
    print(f"Salvo em {args.output}: {len(subjects)} componentes.")


if __name__ == "__main__":
    main()
