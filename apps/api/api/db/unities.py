from collections.abc import Collection

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.models import Unity


async def unity_ids(
    session: AsyncSession, codes: Collection[str | None]
) -> dict[str, int]:
    """Os ids das unidades pelos códigos; o código que não está na tabela fica de fora."""
    wanted = {code for code in codes if code}
    if not wanted:
        return {}
    rows = await session.execute(
        select(Unity.code, Unity.id).where(Unity.code.in_(wanted))
    )
    return {code: id_ for code, id_ in rows}
