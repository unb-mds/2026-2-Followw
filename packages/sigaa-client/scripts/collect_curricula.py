"""Coleta currículos ativos e salva os CSVs de matrizes e componentes usados pelo seed."""

import argparse
import asyncio
import csv
from datetime import date
from pathlib import Path

import httpx

from sigaa_client import Curriculum, CurriculumSummary, SigaaError, SigaaPublicClient

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
MATRIX_COLUMNS = (
    "sigaa_id",
    "course_sigaa_id",
    "code",
    "created_year",
    "active",
    "shift",
    "valid_from",
    "matrix",
)
COMPONENT_COLUMNS = (
    "course_sigaa_id",
    "curriculum_sigaa_id",
    "subject_code",
    "period",
    "kind",
)
DELAY = 0.3
RETRY_DELAY = 2


def select_curricula(
    items: list[CurriculumSummary], year: int, latest_only: bool = False
) -> list[CurriculumSummary]:
    """Inclui a versão anterior à janela para cobrir ingressos antes da primeira revisão."""
    selected = []
    shifts = {item.shift for item in items if item.active}
    for shift in sorted(shifts, key=lambda value: value or ""):
        available = [item for item in items if item.active and item.shift == shift]
        active = [item for item in available if item.created_year <= year]
        if not active:
            newest = max(item.created_year for item in available)
            selected.extend(item for item in available if item.created_year == newest)
            continue
        cutoff = year - 3
        older = [item.created_year for item in active if item.created_year < cutoff]
        baseline = max(older, default=0)
        newest = max(item.created_year for item in active)
        selected.extend(
            item
            for item in active
            if (
                item.created_year == newest
                if latest_only
                else item.created_year >= cutoff or item.created_year == baseline
            )
        )
    return sorted(selected, key=lambda item: (item.created_year, item.sigaa_id))


async def collect_curricula(
    courses_path: Path = DATA_DIR / "courses.csv",
    *,
    year: int | None = None,
    latest_only: bool = False,
    only: list[int] | None = None,
) -> list[Curriculum]:
    year = year if year is not None else date.today().year
    with courses_path.open(encoding="utf-8", newline="") as file:
        courses = {int(row["id"]): row["name"] for row in csv.DictReader(file)}
    if only:
        unknown = set(only) - courses.keys()
        if unknown:
            raise ValueError(f"Cursos ausentes no CSV: {sorted(unknown)}")
        courses = {key: value for key, value in courses.items() if key in only}
    results = []
    for course_id, name in sorted(courses.items()):
        for attempt in range(3):
            try:
                async with SigaaPublicClient(timeout=45) as client:
                    summaries = select_curricula(
                        await client.curricula.list_curricula(course_id),
                        year,
                        latest_only,
                    )
                    collected = []
                    for summary in summaries:
                        collected.append(
                            await client.curricula.get_curriculum(
                                course_id, summary.sigaa_id
                            )
                        )
                        await asyncio.sleep(DELAY)
                results.extend(collected)
                print(f"{course_id} ({name}): {len(collected)} currículos", flush=True)
                break
            except (SigaaError, httpx.HTTPError) as error:
                if attempt == 2:
                    raise RuntimeError(
                        f"Falha no curso {course_id}; dataset não foi substituído: {error}"
                    ) from error
                print(f"Nova tentativa {course_id}: {error}", flush=True)
                await asyncio.sleep(RETRY_DELAY)
    if not results:
        raise RuntimeError("Nenhum currículo encontrado; dataset não foi substituído.")
    return results


def write_csvs(curricula: list[Curriculum], directory: Path) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    matrices = []
    components = []
    for item in curricula:
        matrices.append(item.model_dump() | {"active": str(item.active).lower()})
        groups = [
            (group.period, "required", group.required)
            for group in item.required_by_period
        ]
        groups += [
            (0, "optional", item.optional),
            (None, "complementary", item.complementary),
        ]
        for period, kind, codes in groups:
            for code in codes:
                components.append(
                    {
                        "course_sigaa_id": item.course_sigaa_id,
                        "curriculum_sigaa_id": item.sigaa_id,
                        "subject_code": code,
                        "period": period,
                        "kind": kind,
                    }
                )
    outputs = [
        ("curricula.csv", MATRIX_COLUMNS, matrices),
        ("curriculum_components.csv", COMPONENT_COLUMNS, components),
    ]
    temporary = []
    try:
        for name, columns, rows in outputs:
            path = directory / name
            stage = path.with_suffix(".tmp")
            temporary.append((stage, path))
            with stage.open("w", encoding="utf-8", newline="") as file:
                writer = csv.DictWriter(
                    file, columns, extrasaction="ignore", lineterminator="\n"
                )
                writer.writeheader()
                writer.writerows(rows)
        for stage, path in temporary:
            stage.replace(path)
    finally:
        for stage, _ in temporary:
            stage.unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--courses", type=Path, default=DATA_DIR / "courses.csv")
    parser.add_argument("--output-dir", type=Path, default=DATA_DIR)
    parser.add_argument("--year", type=int, default=date.today().year)
    parser.add_argument("--latest-only", action="store_true")
    parser.add_argument("--course", type=int, action="append")
    args = parser.parse_args()
    if args.course and args.output_dir.resolve() == DATA_DIR.resolve():
        parser.error(
            "--course exige --output-dir para não substituir o dataset completo."
        )
    curricula = asyncio.run(
        collect_curricula(
            args.courses, year=args.year, latest_only=args.latest_only, only=args.course
        )
    )
    write_csvs(curricula, args.output_dir)
    print(
        f"Salvo em {args.output_dir}: {len(curricula)} currículos e seus componentes."
    )


if __name__ == "__main__":
    main()
