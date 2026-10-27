import logging
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.models import Classroom, Subject
from api.db.seed import DATA_DIR, read_csv, upsert
from api.logger import event

CLASSROOMS_CSV = DATA_DIR / "classrooms.csv"
KEY = ("subject_code", "number", "semester")
# Horário e sala das gravadas são do sync, que replaneja as aulas.
FIELDS = ("professors", "vacancies", "occupied")


def read_classrooms(path: Path = CLASSROOMS_CSV) -> list[Classroom]:
    """As turmas do CSV (`subject_code,number,semester,schedule,room,vacancies,occupied,professors`)."""
    return read_csv(
        path,
        lambda row: Classroom(
            subject_code=row["subject_code"].strip().upper(),
            number=row["number"].strip(),
            semester=row["semester"].strip(),
            schedule=row["schedule"].strip() or None,
            room=row["room"].strip() or None,
            professors=[
                name.strip() for name in row["professors"].split(";") if name.strip()
            ],
            vacancies=int(row["vacancies"]) if row["vacancies"] else None,
            occupied=int(row["occupied"]) if row["occupied"] else None,
        ),
        unique=(KEY,),
    )


async def seed_classrooms(session: AsyncSession, path: Path = CLASSROOMS_CSV) -> None:
    subjects = set(await session.scalars(select(Subject.code)))
    read = read_classrooms(path)
    classrooms = [c for c in read if c.subject_code in subjects]
    if skipped := len(read) - len(classrooms):
        event("seed.classrooms_skipped", level=logging.WARNING, skipped_count=skipped)
    await upsert(session, Classroom, classrooms, KEY, FIELDS)
