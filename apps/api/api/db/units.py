from collections.abc import Collection

from sqlalchemy import or_, select
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


async def find_unit(session: AsyncSession, wanted: str) -> Unit | None:
    """A unidade pelo id ou pela sigla, ignorando caixa e espaços."""
    wanted = wanted.strip()
    condition = Unit.code == wanted.upper()
    if wanted.isdigit() and int(wanted) < 2**31:
        condition = or_(Unit.id == int(wanted), condition)
    return await session.scalar(select(Unit).where(condition))
