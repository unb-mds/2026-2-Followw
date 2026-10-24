"""Coleta os perfis e as disciplinas de graduação dos docentes públicos."""

import argparse
import asyncio
import json
from pathlib import Path

from _by_unit import DATA_DIR, collect_by_unit, write_csv

from sigaa_client import ProfessorProfile, SigaaPublicClient, Unit

PROFESSOR_COLUMNS = (
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
)


async def collect_professors(
    only: list[str] | None = None, workers: int = 2
) -> list[ProfessorProfile]:
    async with SigaaPublicClient(timeout=45) as client:
        units = await client.professors.list_departments()
    if not units:
        raise RuntimeError("O SIGAA não retornou departamentos.")
    if only:
        wanted = {value.casefold() for value in only}
        units = [
            unit for unit in units if wanted & {str(unit.id), unit.name.casefold()}
        ]
        if not units:
            raise RuntimeError(f"Nenhum departamento casa com {only}.")

    progress: dict[int, dict[int, ProfessorProfile]] = {}

    async def collect_unit(
        client: SigaaPublicClient, unit: Unit
    ) -> dict[int, ProfessorProfile]:
        found = progress.setdefault(unit.id, {})
        for professor in await client.professors.search(unit):
            if professor.siape not in found:
                found[professor.siape] = await client.professors.get_profile(professor)
        return found

    by_unit = await collect_by_unit(
        units, collect_unit, lambda found: f"{len(found)} docentes", workers
    )
    professors: dict[int, ProfessorProfile] = {}
    for unit_id, found in sorted(by_unit.items()):
        for siape, professor in found.items():
            previous = professors.get(siape)
            if previous is not None and previous.name != professor.name:
                raise RuntimeError(
                    f"SIAPE {siape} com nomes diferentes entre unidades."
                )
            professors.setdefault(siape, professor)
    if not professors:
        raise RuntimeError("Nenhum docente encontrado; nada foi salvo.")
    return [professors[siape] for siape in sorted(professors)]


def rows(
    professors: list[ProfessorProfile],
) -> list[dict[str, object]]:
    profiles = []
    for professor in professors:
        by_semester: dict[str, dict[str, int]] = {}
        for discipline in professor.disciplines:
            codes = by_semester.setdefault(discipline.semester, {})
            if discipline.code in codes:
                raise ValueError(
                    f"Disciplina repetida para {professor.siape}: "
                    f"{discipline.semester}/{discipline.code}."
                )
            codes[discipline.code] = discipline.occurrences
        profiles.append(
            {
                **professor.model_dump(exclude={"department", "disciplines", "url"}),
                "department_id": professor.department.id,
                "disciplines": json.dumps(
                    by_semester, ensure_ascii=False, separators=(",", ":")
                ),
            }
        )
    return profiles


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--unit", action="append", help="ID ou nome exato; repetível")
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument("--output-dir", type=Path, default=DATA_DIR)
    args = parser.parse_args()
    if args.workers < 1:
        parser.error("--workers precisa ser positivo")
    if args.unit and args.output_dir.resolve() == DATA_DIR.resolve():
        parser.error(
            "--unit requer --output-dir para não substituir o catálogo completo"
        )
    profiles = rows(asyncio.run(collect_professors(args.unit, args.workers)))
    write_csv(profiles, PROFESSOR_COLUMNS, args.output_dir / "professors.csv")
    print(f"Salvos {len(profiles)} docentes em professors.csv.")


if __name__ == "__main__":
    main()
