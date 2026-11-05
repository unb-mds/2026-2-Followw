"""Completa o CSV com componentes das matrizes e dos requisitos, mesmo sem oferta."""

import argparse
import asyncio
import csv
import json
import re
from collections.abc import Iterable
from pathlib import Path

from _by_unit import DATA_DIR, TIMEOUT, write_csv

from sigaa_client import PublicSubject, SigaaPublicClient, SigaaSearchError

OUTPUT = DATA_DIR / "subjects.csv"
CURRICULUM_COMPONENTS = DATA_DIR / "curriculum_components.csv"
SEARCH_DELAY = 0.3
REQUIREMENTS = ("prerequisites", "corequisites", "equivalences")
_CODE_RE = re.compile(r"\b[A-Z]+[0-9]+\b")


def read_curriculum_codes(path: Path = CURRICULUM_COMPONENTS) -> set[str]:
    with path.open(encoding="utf-8", newline="") as file:
        reader = csv.DictReader(file)
        if not {"kind", "subject_codes"}.issubset(reader.fieldnames or []):
            raise ValueError("CSV de matrizes sem colunas kind e subject_codes.")
        return {
            code.strip().upper()
            for row in reader
            for code in row["subject_codes"].split()
        }


def _referenced(rows: Iterable[dict[str, object]]) -> set[str]:
    return {
        code
        for row in rows
        for field in REQUIREMENTS
        for code in _CODE_RE.findall(str(row[field] or ""))
    }


def read_reference_codes(paths: Iterable[Path]) -> set[str]:
    codes: set[str] = set()
    for path in paths:
        with path.open(encoding="utf-8", newline="") as file:
            for row in csv.DictReader(file):
                for field in ("subject_code", "subject_codes", *REQUIREMENTS):
                    codes.update(_CODE_RE.findall((row.get(field) or "").upper()))
                for disciplines in json.loads(row.get("disciplines") or "{}").values():
                    codes.update(code.strip().upper() for code in disciplines)
    return codes


async def complete_subjects(
    rows: list[dict[str, object]], referenced_codes: Iterable[str] = ()
) -> list[dict[str, object]]:
    known = {str(row["code"]) for row in rows}
    missing = (_referenced(rows) | set(referenced_codes)) - known
    if not missing:
        return rows

    added: list[dict[str, object]] = []
    attempted: set[str] = set()
    async with SigaaPublicClient(timeout=TIMEOUT) as client:
        # Os requisitos dos acrescentados podem citar outros componentes de fora.
        while missing:
            attempted |= missing
            found = await _details_rows(await _search(client, missing))
            added.extend(found)
            missing = _referenced(found) - known - attempted

    unresolved = sorted(attempted - {str(row["code"]) for row in added})
    print(
        f"Componentes acrescentados: {len(added)}. Referências não encontradas: {len(unresolved)}."
    )
    if unresolved:
        print("Sem resultado no SIGAA: " + ", ".join(unresolved))
    return sorted([*rows, *added], key=lambda row: str(row["code"]))


async def _search(client: SigaaPublicClient, missing: set[str]) -> list[PublicSubject]:
    found: dict[str, PublicSubject] = {}
    for prefix in sorted({code.rstrip("0123456789") for code in missing}):
        wanted = {
            code
            for code in missing
            if code.startswith(prefix) and code[len(prefix) :].isdigit()
        }
        result = await client.subjects.search(code=prefix)
        candidates = list(result.items)
        if result.truncated:
            returned = {subject.code for subject in candidates}
            for code in sorted(wanted - returned):
                await asyncio.sleep(SEARCH_DELAY)
                candidates.extend((await client.subjects.search(code=code)).items)
        for subject in candidates:
            if subject.code in wanted:
                found[subject.code] = subject
        print(
            f"{prefix}: {len(wanted & found.keys())} de {len(wanted)} referências encontradas.",
            flush=True,
        )
        await asyncio.sleep(SEARCH_DELAY)
    return [found[code] for code in sorted(found)]


async def _details_row(
    client: SigaaPublicClient, subject: PublicSubject
) -> dict[str, object]:
    details = await client.subjects.get_details(subject)
    await asyncio.sleep(SEARCH_DELAY)
    return {
        "code": details.code,
        "name": details.name,
        "hours": details.hours,
        "unit_id": None,
        **{field: getattr(details, field) for field in REQUIREMENTS},
    }


async def _details_rows(subjects: list[PublicSubject]) -> list[dict[str, object]]:
    pending = iter(subjects)
    rows: list[dict[str, object]] = []

    async def worker() -> None:
        async with SigaaPublicClient(timeout=TIMEOUT) as client:
            for subject in pending:
                rows.append(await _details_row(client, subject))
                if len(rows) % 50 == 0 or len(rows) == len(subjects):
                    print(f"Detalhes: {len(rows)} de {len(subjects)}.", flush=True)

    async with asyncio.TaskGroup() as tasks:
        for _ in range(2):
            tasks.create_task(worker())
    return rows


async def complete_from_curricula(
    rows: list[dict[str, object]], path: Path = CURRICULUM_COMPONENTS
) -> list[dict[str, object]]:
    known = {str(row["code"]) for row in rows}
    sources: dict[str, list[tuple[int, int]]] = {}
    with path.open(encoding="utf-8", newline="") as file:
        for row in csv.DictReader(file):
            for code in row["subject_codes"].split():
                if code not in known:
                    source = (
                        int(row["course_sigaa_id"]),
                        int(row["curriculum_sigaa_id"]),
                    )
                    if source not in sources.setdefault(code, []):
                        sources[code].append(source)
    pending = iter(sorted(sources))
    added: list[dict[str, object]] = []

    async def worker() -> None:
        async with SigaaPublicClient(timeout=TIMEOUT) as client:
            for code in pending:
                for source in sources[code]:
                    try:
                        details = await client.curricula.get_subject_details(
                            *source, code
                        )
                        break
                    except SigaaSearchError:
                        continue
                else:
                    print(f"Sem detalhes nos currículos atuais: {code}.", flush=True)
                    continue
                added.append(
                    {
                        "code": details.code,
                        "name": details.name,
                        "hours": details.hours,
                        "unit_id": None,
                        **{field: getattr(details, field) for field in REQUIREMENTS},
                    }
                )
                if len(added) % 50 == 0 or len(added) == len(sources):
                    print(f"Currículos: {len(added)} de {len(sources)}.", flush=True)
                await asyncio.sleep(SEARCH_DELAY)

    if sources:
        async with asyncio.TaskGroup() as tasks:
            for _ in range(2):
                tasks.create_task(worker())
    return sorted([*rows, *added], key=lambda row: str(row["code"]))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=OUTPUT)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument(
        "--curriculum-components", type=Path, default=CURRICULUM_COMPONENTS
    )
    args = parser.parse_args()
    with args.input.open(encoding="utf-8", newline="") as file:
        reader = csv.DictReader(file)
        columns = reader.fieldnames
        rows = list(reader)
    if columns is None:
        raise ValueError("CSV de componentes sem cabeçalho.")
    completed = asyncio.run(
        complete_subjects(
            rows,
            read_curriculum_codes(args.curriculum_components)
            | read_reference_codes(args.input.parent.glob("*.csv")),
        )
    )
    completed = asyncio.run(
        complete_from_curricula(completed, args.curriculum_components)
    )
    completed = asyncio.run(complete_subjects(completed))
    write_csv(completed, columns, args.output)


if __name__ == "__main__":
    main()
