from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession


async def paginate[T](
    session: AsyncSession, query: Select[tuple[T]], page: int, page_size: int
) -> tuple[list[T], int]:
    """Itens da página e total da consulta; página além do total não vai ao banco."""
    total = await session.scalar(
        select(func.count()).select_from(query.order_by(None).subquery())
    )
    total = total or 0
    if (page - 1) * page_size >= total:
        return [], total
    items = await session.scalars(query.offset((page - 1) * page_size).limit(page_size))
    return list(items), total
