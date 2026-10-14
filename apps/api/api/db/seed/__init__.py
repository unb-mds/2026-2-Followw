import csv
from collections.abc import Callable, Sequence
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.base import Base

# Os CSVs ficam em `packages/sigaa-client/data/`, gerados pelos scripts do pacote.
DATA_DIR = Path(__file__).resolve().parents[5] / "packages/sigaa-client/data"


type Key = str | tuple[str, ...]


def _fields(key: Key) -> tuple[str, ...]:
    return (key,) if isinstance(key, str) else key


def _value(row: Base, key: Key) -> tuple[object, ...]:
    return tuple(getattr(row, field) for field in _fields(key))


def read_csv[M: Base](
    path: Path, parse: Callable[[dict[str, str]], M], unique: Sequence[Key]
) -> list[M]:
    """As linhas do CSV montadas por `parse`; as chaves `unique` não se repetem."""
    with path.open(encoding="utf-8", newline="") as file:
        rows = [parse(row) for row in csv.DictReader(file)]
    for key in unique:
        values = [v for row in rows if None not in (v := _value(row, key))]
        if len(values) != len(set(values)):
            raise ValueError(f"`{', '.join(_fields(key))}` repetido em {path.name}.")
    return rows


async def upsert[M: Base](
    session: AsyncSession,
    model: type[M],
    rows: Sequence[M],
    key: Key,
    fields: Sequence[str],
) -> None:
    """Cria as linhas novas e atualiza `fields` das já gravadas, achadas por `key`."""
    filled = [getattr(model, field).is_not(None) for field in _fields(key)]
    saved = {
        _value(row, key): row
        for row in await session.scalars(select(model).where(*filled))
    }
    for row in rows:
        current = saved.get(_value(row, key))
        if current is None:
            session.add(row)
            continue
        for field in fields:
            setattr(current, field, getattr(row, field))
    await session.flush()
