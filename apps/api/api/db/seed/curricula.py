import asyncio
import csv
from pathlib import Path

from sigaa_client import Curriculum as PublicCurriculum
from sqlalchemy import delete, insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.models import Course, Curriculum, CurriculumComponent
from api.db.seed import DATA_DIR, upsert

CURRICULA_CSV = DATA_DIR / "curricula.csv"
COMPONENTS_CSV = DATA_DIR / "curriculum_components.csv"


def read_curricula(
    path: Path = CURRICULA_CSV, components_path: Path = COMPONENTS_CSV
) -> list[PublicCurriculum]:
    matrices = {}
    with path.open(encoding="utf-8", newline="") as file:
        for row in csv.DictReader(file):
            item = PublicCurriculum.model_validate(
                row
                | {
                    "shift": row["shift"] or None,
                    "required_by_period": [],
                    "optional": [],
                    "complementary": [],
                }
            )
            key = (item.course_sigaa_id, item.sigaa_id)
            if key in matrices:
                raise ValueError(f"Currículo repetido em {path.name}: {key}.")
            matrices[key] = item.model_dump()
    if not matrices:
        raise ValueError(f"Dataset de currículos vazio em {path.name}.")
    periods = {key: {} for key in matrices}
    optional = {key: [] for key in matrices}
    complementary = {key: [] for key in matrices}
    seen = set()
    with components_path.open(encoding="utf-8", newline="") as file:
        for row in csv.DictReader(file):
            key = (int(row["course_sigaa_id"]), int(row["curriculum_sigaa_id"]))
            if key not in matrices:
                raise ValueError(
                    f"Matriz ausente para componente em {components_path.name}: {key}."
                )
            code = row["subject_code"].strip()
            kind = row["kind"]
            period = int(row["period"]) if row["period"] else None
            valid = (
                (kind == "required" and period is not None and period > 0)
                or (kind == "optional" and period == 0)
                or (kind == "complementary" and period is None)
            )
            if not code or not valid:
                raise ValueError(
                    f"Componente ou período inválido em {components_path.name}: {row}."
                )
            identity = (*key, code, kind, period)
            if identity in seen:
                raise ValueError(
                    f"Componente repetido em {components_path.name}: {identity}."
                )
            seen.add(identity)
            if kind == "required":
                periods[key].setdefault(period, []).append(code)
            elif kind == "optional":
                optional[key].append(code)
            else:
                complementary[key].append(code)
    result = []
    for key, fields in matrices.items():
        if not periods[key] and not optional[key] and not complementary[key]:
            raise ValueError(
                f"Matriz sem componentes em {components_path.name}: {key}."
            )
        result.append(
            PublicCurriculum.model_validate(
                fields
                | {
                    "required_by_period": [
                        {"period": period, "required": codes}
                        for period, codes in sorted(periods[key].items())
                    ],
                    "optional": optional[key],
                    "complementary": complementary[key],
                }
            )
        )
    return result


async def seed_curricula(
    session: AsyncSession,
    path: Path = CURRICULA_CSV,
    components_path: Path = COMPONENTS_CSV,
) -> None:
    curricula = read_curricula(path, components_path)
    courses = dict(
        (
            await session.execute(
                select(Course.sigaa_id, Course.id).where(Course.sigaa_id.is_not(None))
            )
        ).all()
    )
    missing = {item.course_sigaa_id for item in curricula} - courses.keys()
    if missing:
        raise ValueError(f"Cursos dos currículos ausentes no banco: {sorted(missing)}")
    fields = ("code", "valid_from", "created_year", "active", "shift", "matrix")
    rows = [
        Curriculum(
            course_id=courses[item.course_sigaa_id],
            sigaa_id=item.sigaa_id,
            **{field: getattr(item, field) for field in fields},
        )
        for item in curricula
    ]
    await upsert(session, Curriculum, rows, ("course_id", "sigaa_id"), fields)
    saved = {
        (item.course_id, item.sigaa_id): item.id
        for item in await session.scalars(select(Curriculum))
    }
    components = []
    identifiers = []
    for item in curricula:
        identifier = saved[courses[item.course_sigaa_id], item.sigaa_id]
        identifiers.append(identifier)
        groups = [
            (group.period, "required", group.required)
            for group in item.required_by_period
        ]
        groups += [
            (0, "optional", item.optional),
            (None, "complementary", item.complementary),
        ]
        for period, kind, codes in groups:
            components.extend(
                {
                    "curriculum_id": identifier,
                    "subject_code": code,
                    "period": period,
                    "kind": kind,
                }
                for code in codes
            )
    await session.execute(
        delete(CurriculumComponent).where(
            CurriculumComponent.curriculum_id.in_(identifiers)
        )
    )
    for start in range(0, len(components), 1000):
        await session.execute(
            insert(CurriculumComponent), components[start : start + 1000]
        )


async def _run() -> None:
    from api.db.main import async_session, engine

    try:
        async with engine.begin() as connection:
            for table in (Curriculum.__table__, CurriculumComponent.__table__):
                await connection.run_sync(
                    lambda conn, table=table: table.create(conn, checkfirst=True)
                )
        async with async_session.begin() as session:
            await seed_curricula(session)
        print(f"Seed concluído: {len(read_curricula())} currículos e seus componentes.")
    finally:
        await engine.dispose()


def main() -> None:
    asyncio.run(_run())
