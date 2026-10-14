from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.models import Classroom, Subject
from api.db.seed import DATA_DIR, read_csv, upsert

CLASSROOMS_CSV = DATA_DIR / "classrooms.csv"
KEY = ("subject_code", "number", "semester")
# Horário e sala das gravadas são do sync, que replaneja as aulas.
FIELDS = ("professors", "vacancies", "occupied")


def read_classrooms(path: Path = CLASSROOMS_CSV) -> list[Classroom]:
    """As turmas do CSV; a unidade não tem coluna na tabela."""
    return read_csv(
        path,
        lambda row: Classroom(
            subject_code=row["subject_code"].strip(),
            number=row["number"].strip(),
            semester=row["semester"].strip(),
            schedule=row["schedule"].strip() or None,
            room=row["room"].strip() or None,
            professors=[
                name.strip() for name in row["teachers"].split(";") if name.strip()
            ],
            vacancies=int(row["vacancies"]) if row["vacancies"] else None,
            occupied=int(row["occupied"]) if row["occupied"] else None,
        ),
        unique=(KEY,),
    )


async def seed_classrooms(session: AsyncSession, path: Path = CLASSROOMS_CSV) -> None:
    subjects = set(await session.scalars(select(Subject.code)))
    classrooms = [c for c in read_classrooms(path) if c.subject_code in subjects]
    await upsert(session, Classroom, classrooms, KEY, FIELDS)
