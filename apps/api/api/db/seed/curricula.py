import csv
import logging
from pathlib import Path

from sigaa_client import Curriculum as PublicCurriculum
from sqlalchemy import delete, func, insert, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.models import Course, Curriculum, CurriculumComponent
from api.db.seed import DATA_DIR, upsert
from api.logger import event

CURRICULA_CSV = DATA_DIR / "curricula.csv"
COMPONENTS_CSV = DATA_DIR / "curriculum_components.csv"
# Colunas da matriz: tudo do modelo público, menos identidade e componentes.
_NOT_MATRIX = {
    "sigaa_id",
    "course_sigaa_id",
    "required_by_period",
    "optional",
    "complementary",
}
MATRIX_FIELDS = tuple(f for f in PublicCurriculum.model_fields if f not in _NOT_MATRIX)


def read_curricula(
    path: Path = CURRICULA_CSV, components_path: Path = COMPONENTS_CSV
) -> list[PublicCurriculum]:
    matrices = {}
    with path.open(encoding="utf-8", newline="") as file:
        for row in csv.DictReader(file):
            item = PublicCurriculum.model_validate(
                {key: value or None for key, value in row.items()}
                | {
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
            codes = [code.upper() for code in row["subject_codes"].split()]
            kind = row["kind"]
            period = int(row["period"]) if row["period"] else None
            valid = (
                (kind == "required" and period is not None and period > 0)
                or (kind == "optional" and period == 0)
                or (kind == "complementary" and period is None)
            )
            if not valid:
                raise ValueError(
                    f"Componente ou período inválido em {components_path.name}: {row}."
                )
            identity = (*key, period)
            if identity in seen:
                raise ValueError(
                    f"Período repetido em {components_path.name}: {identity}."
                )
            seen.add(identity)
            if len(codes) != len(set(codes)):
                raise ValueError(
                    f"Componente repetido no período {period} em {components_path.name}: {key}."
                )
            if kind == "required":
                periods[key][period] = codes
            elif kind == "optional":
                optional[key] = codes
            else:
                complementary[key] = codes
    result = []
    for key, fields in matrices.items():
        if (
            not any(periods[key].values())
            and not optional[key]
            and not complementary[key]
        ):
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
    rows = [
        Curriculum(
            course_id=courses[item.course_sigaa_id],
            sigaa_id=item.sigaa_id,
            **{field: getattr(item, field) for field in MATRIX_FIELDS},
        )
        for item in curricula
    ]
    await upsert(session, Curriculum, rows, ("course_id", "sigaa_id"), MATRIX_FIELDS)
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
    # Matrizes fora do CSV ficam inativas, com os componentes, pois usuários ainda as usam.
    await session.execute(
        delete(CurriculumComponent).where(
            CurriculumComponent.curriculum_id.in_(identifiers)
        )
    )
    await session.execute(
        update(Curriculum).where(Curriculum.id.not_in(identifiers)).values(active=False)
    )
    for start in range(0, len(components), 1000):
        await session.execute(
            insert(CurriculumComponent), components[start : start + 1000]
        )
    inactive = await session.scalars(
        select(Curriculum.course_id)
        .group_by(Curriculum.course_id)
        .having(func.count().filter(Curriculum.active.is_(True)) == 0)
    )
    if count := len(inactive.all()):
        event(
            "seed.courses_without_active_curriculum",
            level=logging.ERROR,
            course_count=count,
        )
