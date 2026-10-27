from sqlalchemy.ext.asyncio import AsyncSession

from api.db.seed.classrooms import seed_classrooms
from api.db.seed.courses import seed_courses
from api.db.seed.curricula import seed_curricula
from api.db.seed.subjects import seed_subjects
from api.db.seed.units import seed_units


async def seed_database(session: AsyncSession) -> None:
    """Grava os dados de referência; a ordem importa."""
    await seed_units(session)
    await seed_courses(session)
    await seed_curricula(session)
    await seed_subjects(session)
    await seed_classrooms(session)
