from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from api.db.models import Subject
from api.db.seed import DATA_DIR, read_csv, upsert

SUBJECTS_CSV = DATA_DIR / "subjects.csv"


def read_subjects(path: Path = SUBJECTS_CSV) -> list[Subject]:
    """Os componentes do CSV (`code,name,hours,unity_id,...`); os requisitos não são lidos."""
    return read_csv(
        path,
        lambda row: Subject(
            code=row["code"].strip(),
            name=row["name"].strip(),
            hours=int(row["hours"]) if row["hours"] else None,
            unity_id=int(row["unity_id"]) if row["unity_id"] else None,
        ),
        unique=("code",),
    )


async def seed_subjects(session: AsyncSession, path: Path = SUBJECTS_CSV) -> None:
    """As unidades precisam estar gravadas."""
    await upsert(
        session, Subject, read_subjects(path), "code", ("name", "hours", "unity_id")
    )
