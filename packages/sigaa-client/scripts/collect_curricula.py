"""Coleta currículos ativos e salva os CSVs de matrizes e componentes usados pelo seed."""

import argparse
import asyncio
import csv
from datetime import date
from pathlib import Path

from _collect import DATA_DIR, NETWORK_ERRORS, run_pool, with_retries, write_csv

from sigaa_client import Curriculum, CurriculumSummary, SigaaPublicClient

MATRIX_COLUMNS = (
    "sigaa_id",
    "course_sigaa_id",
    "code",
    "created_year",
    "active",
    "shift",
    "valid_from",
    "matrix",
    "total_workload",
    "required_workload",
    "optional_min_workload",
    "complementary_min_workload",
    "elective_max_workload",
    "period_max_workload",
    "period_min_workload",
    "min_semesters",
    "avg_semesters",
    "max_semesters",
)
COMPONENT_COLUMNS = (
    "course_sigaa_id",
    "curriculum_sigaa_id",
    "period",
    "kind",
    "subject_codes",
)
DELAY = 0.3


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
    workers: int = 2,
) -> list[Curriculum]:
    year = year if year is not None else date.today().year
    with courses_path.open(encoding="utf-8", newline="") as file:
        courses = {int(row["id"]): row["name"] for row in csv.DictReader(file)}
    if only:
        unknown = set(only) - courses.keys()
        if unknown:
            raise ValueError(f"Cursos ausentes no CSV: {sorted(unknown)}")
        courses = {key: value for key, value in courses.items() if key in only}

    async def collect_course(
        client: SigaaPublicClient, course_id: int
    ) -> list[Curriculum]:
        async def step() -> list[Curriculum]:
            summaries = select_curricula(
                await client.curricula.list_curricula(course_id), year, latest_only
            )
            collected = []
            for summary in summaries:
                collected.append(
                    await client.curricula.get_curriculum(course_id, summary.sigaa_id)
                )
                await asyncio.sleep(DELAY)
            return collected

        try:
            collected = await with_retries(step, course_id)
        except NETWORK_ERRORS as error:
            raise RuntimeError(
                f"Falha no curso {course_id}; dataset não foi substituído: {error}"
            ) from error
        print(
            f"{course_id} ({courses[course_id]}): {len(collected)} currículos",
            flush=True,
        )
        return collected

    found = await run_pool(sorted(courses), collect_course, workers)
    results = [item for collected in found for item in collected]
    if not results:
        raise RuntimeError("Nenhum currículo encontrado; dataset não foi substituído.")
    return results


def write_csvs(curricula: list[Curriculum], directory: Path) -> None:
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
            if kind == "complementary" and not codes:
                continue
            components.append(
                {
                    "course_sigaa_id": item.course_sigaa_id,
                    "curriculum_sigaa_id": item.sigaa_id,
                    "period": period,
                    "kind": kind,
                    "subject_codes": " ".join(codes),
                }
            )
    write_csv(
        (directory / "curricula.csv", MATRIX_COLUMNS, matrices),
        (directory / "curriculum_components.csv", COMPONENT_COLUMNS, components),
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--courses", type=Path, default=DATA_DIR / "courses.csv")
    parser.add_argument("--output-dir", type=Path, default=DATA_DIR)
    parser.add_argument("--year", type=int, default=date.today().year)
    parser.add_argument("--latest-only", action="store_true")
    parser.add_argument("--course", type=int, action="append")
    parser.add_argument("--workers", type=int, default=2)
    args = parser.parse_args()
    if args.course and args.output_dir.resolve() == DATA_DIR.resolve():
        parser.error(
            "--course exige --output-dir para não substituir o dataset completo."
        )
    curricula = asyncio.run(
        collect_curricula(
            args.courses,
            year=args.year,
            latest_only=args.latest_only,
            only=args.course,
            workers=args.workers,
        )
    )
    write_csvs(curricula, args.output_dir)
    print(
        f"Salvo em {args.output_dir}: {len(curricula)} currículos e seus componentes."
    )


if __name__ == "__main__":
    main()
