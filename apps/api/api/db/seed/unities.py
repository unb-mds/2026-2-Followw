from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from api.db.models import Unity
from api.db.seed import DATA_DIR, read_csv, upsert

UNITIES_CSV = DATA_DIR / "unities.csv"


def read_unities(path: Path = UNITIES_CSV) -> list[Unity]:
    """As unidades do CSV (`id,code,name`); `code` vazio fica nulo até ser preenchido."""
    return read_csv(
        path,
        lambda row: Unity(
            id=int(row["id"]),
            code=row["code"].strip().upper() or None,
            name=row["name"].strip(),
        ),
        unique=("id", "code"),
    )


async def seed_unities(session: AsyncSession, path: Path = UNITIES_CSV) -> None:
    await upsert(session, Unity, read_unities(path), "id", ("code", "name"))
