import asyncio
from pathlib import Path

from pydantic import TypeAdapter
from sigaa_client import Curriculum as PublicCurriculum
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.models import Course, Curriculum
from api.db.seed import DATA_DIR, upsert

CURRICULA_JSON = DATA_DIR / "curricula.json"


def read_curricula(path: Path = CURRICULA_JSON) -> list[PublicCurriculum]:
    curricula = TypeAdapter(list[PublicCurriculum]).validate_json(
        path.read_text(encoding="utf-8")
    )
    keys = [(item.course_sigaa_id, item.sigaa_id) for item in curricula]
    if len(keys) != len(set(keys)):
        raise ValueError(f"Currículo repetido em {path.name}.")
    if not curricula:
        raise ValueError(f"Dataset de currículos vazio em {path.name}.")
    return curricula


async def seed_curricula(session: AsyncSession, path: Path = CURRICULA_JSON) -> None:
    curricula = read_curricula(path)
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
            code=item.code,
            valid_from=item.valid_from,
            data=item.model_dump(mode="json"),
        )
        for item in curricula
    ]
    await upsert(
        session,
        Curriculum,
        rows,
        ("course_id", "sigaa_id"),
        ("code", "valid_from", "data"),
    )


async def _run() -> None:
    from api.db.main import async_session, engine

    try:
        async with engine.begin() as connection:
            await connection.run_sync(
                lambda conn: Curriculum.__table__.create(conn, checkfirst=True)
            )
        async with async_session.begin() as session:
            await seed_curricula(session)
        print(f"Seed concluído: {len(read_curricula())} currículos.")
    finally:
        await engine.dispose()


def main() -> None:
    asyncio.run(_run())
