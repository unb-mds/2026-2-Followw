from sqlalchemy.ext.asyncio import AsyncSession

from api.db.seed.courses import seed_courses
from api.db.seed.subjects import seed_subjects
from api.db.seed.unities import seed_unities


async def seed_database(session: AsyncSession) -> None:
    """Grava os dados de referência; a ordem importa."""
    await seed_unities(session)
    await seed_courses(session)
    await seed_subjects(session)
