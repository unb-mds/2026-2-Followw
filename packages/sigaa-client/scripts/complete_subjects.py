"""Completa o CSV com componentes das matrizes e dos requisitos, mesmo sem oferta."""

import argparse
import asyncio
import csv
import re
from collections.abc import Iterable
from pathlib import Path

from _by_unit import DATA_DIR, TIMEOUT, write_csv

from sigaa_client import SigaaPublicClient

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
            if row["kind"] == "required"
            for code in row["subject_codes"].split()
        }


async def complete_subjects(
    rows: list[dict[str, object]], curriculum_codes: Iterable[str] = ()
) -> list[dict[str, object]]:
    codes = {str(row["code"]) for row in rows}
    missing = (
        {
            code
            for row in rows
            for field in REQUIREMENTS
            for code in _CODE_RE.findall(str(row[field] or ""))
        }
        | set(curriculum_codes)
    ) - codes
    if not missing:
        return rows

    found = {}
    prefixes = sorted({code.rstrip("0123456789") for code in missing})
    async with SigaaPublicClient(timeout=TIMEOUT) as client:
        for prefix in prefixes:
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
                    found[subject.code] = {
                        "code": subject.code,
                        "name": subject.name,
                        "hours": subject.hours,
                        "unit_id": None,
                        **dict.fromkeys(REQUIREMENTS),
                    }
            print(
                f"{prefix}: {len(wanted & found.keys())} de {len(wanted)} referências encontradas.",
                flush=True,
            )
            await asyncio.sleep(SEARCH_DELAY)

    unresolved = sorted(missing - found.keys())
    print(
        f"Componentes acrescentados: {len(found)}. Referências não encontradas: {len(unresolved)}."
    )
    if unresolved:
        print("Sem resultado no SIGAA: " + ", ".join(unresolved))
    return sorted([*rows, *found.values()], key=lambda row: str(row["code"]))


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
    write_csv(
        asyncio.run(
            complete_subjects(rows, read_curriculum_codes(args.curriculum_components))
        ),
        columns,
        args.output,
    )


if __name__ == "__main__":
    main()
