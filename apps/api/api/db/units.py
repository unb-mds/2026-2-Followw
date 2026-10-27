from collections.abc import Collection

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.models import Unit


async def unit_ids(
    session: AsyncSession, codes: Collection[str | None]
) -> dict[str, int]:
    """Os ids das unidades pelos códigos; o código que não está na tabela fica de fora."""
    wanted = {code for code in codes if code}
    if not wanted:
        return {}
    rows = await session.execute(
        select(Unit.code, Unit.id).where(Unit.code.in_(wanted))
    )
    return {code: id_ for code, id_ in rows}


class UnitNotFound(LookupError):
    def __init__(self, wanted: int | str) -> None:
        super().__init__(f"Unidade `{wanted}` não encontrada.")


async def find_unit(session: AsyncSession, wanted: int | str) -> Unit:
    """A unidade pelo id ou pela sigla exata, ignorando caixa."""
    if isinstance(wanted, int):
        condition = Unit.id == wanted
    else:
        condition = Unit.code == wanted.upper()
    unit = await session.scalar(select(Unit).where(condition))
    if unit is None:
        raise UnitNotFound(wanted)
    return unit
