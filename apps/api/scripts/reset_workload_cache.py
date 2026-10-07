"""Invalida o cache de perfil dos usuários sem workload, forçando ressincronização."""

import asyncio

from sqlalchemy import update
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from api.db.models import User
from api.core.config import settings


async def main() -> None:
    engine = create_async_engine(settings.database_url)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    async with async_session() as session:
        result = await session.execute(
            update(User)
            .where(User.workload.is_(None), User.profile_synced_at.isnot(None))
            .values(profile_synced_at=None)
            .returning(User.registration)
        )
        affected = result.fetchall()
        await session.commit()

    print(f"Cache de perfil invalidado para {len(affected)} usuário(s).")
    for (reg,) in affected:
        print(f"  {reg}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
