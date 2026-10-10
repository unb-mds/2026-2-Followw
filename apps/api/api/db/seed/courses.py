from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from api.db.models import Course
from api.db.seed import DATA_DIR, read_csv, upsert

COURSES_CSV = DATA_DIR / "courses.csv"


def read_courses(path: Path = COURSES_CSV) -> list[Course]:
    """Os cursos do CSV (`id,unity_id,shift,name`), com o id do SIGAA em `sigaa_id`."""
    return read_csv(
        path,
        lambda row: Course(
            sigaa_id=int(row["id"]),
            unity_id=int(row["unity_id"]),
            shift=row["shift"].strip() or None,
            name=row["name"].strip(),
        ),
        unique=("sigaa_id",),
    )


async def seed_courses(session: AsyncSession, path: Path = COURSES_CSV) -> None:
    """As unidades precisam estar gravadas."""
    await upsert(
        session, Course, read_courses(path), "sigaa_id", ("unity_id", "shift", "name")
    )
