from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from api.db.models import Unit
from api.db.seed import DATA_DIR, read_csv, upsert

UNITS_CSV = DATA_DIR / "units.csv"


def read_units(path: Path = UNITS_CSV) -> list[Unit]:
    """As unidades do CSV (`id,code,name`); `code` vazio fica nulo até ser preenchido."""
    return read_csv(
        path,
        lambda row: Unit(
            id=int(row["id"]),
            code=row["code"].strip().upper() or None,
            name=row["name"].strip(),
        ),
        unique=(("id",), ("code",)),
    )


async def seed_units(session: AsyncSession, path: Path = UNITS_CSV) -> None:
    await upsert(session, Unit, read_units(path), ("id",), ("code", "name"))
