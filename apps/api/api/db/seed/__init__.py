import csv
from collections.abc import Callable, Sequence
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.base import Base

# Os CSVs ficam em `packages/sigaa-client/data/`, gerados pelos scripts do pacote.
DATA_DIR = Path(__file__).resolve().parents[5] / "packages/sigaa-client/data"


def read_csv[M: Base](
    path: Path, parse: Callable[[dict[str, str]], M], unique: Sequence[str]
) -> list[M]:
    """As linhas do CSV montadas por `parse`; os campos `unique` não se repetem."""
    with path.open(encoding="utf-8", newline="") as file:
        rows = [parse(row) for row in csv.DictReader(file)]
    for field in unique:
        values = [v for row in rows if (v := getattr(row, field)) is not None]
        if len(values) != len(set(values)):
            raise ValueError(f"`{field}` repetido em {path.name}.")
    return rows


async def upsert[M: Base](
    session: AsyncSession,
    model: type[M],
    rows: Sequence[M],
    key: str,
    fields: Sequence[str],
) -> None:
    """Cria as linhas novas e atualiza `fields` das já gravadas, achadas por `key`."""
    column = getattr(model, key)
    saved = {
        getattr(row, key): row
        for row in await session.scalars(select(model).where(column.is_not(None)))
    }
    for row in rows:
        current = saved.get(getattr(row, key))
        if current is None:
            session.add(row)
            continue
        for field in fields:
            setattr(current, field, getattr(row, field))
    await session.flush()
