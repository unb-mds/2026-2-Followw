import asyncio
from collections.abc import Awaitable, Callable
from typing import Annotated

from fastapi import Depends
from sqlalchemy import Connection
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from api.core.config import settings
from api.db import models  # noqa: F401 — registra os modelos em Base.metadata
from api.db.base import Base

# A instância da Vercel congela entre requisições: a conexão parada pode ter caído.
engine = create_async_engine(settings.database_url, pool_pre_ping=True)

async_session = async_sessionmaker(engine, expire_on_commit=False)

_WRITE_ATTEMPTS = 3


def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    return async_session


SessionmakerDep = Annotated[async_sessionmaker[AsyncSession], Depends(get_sessionmaker)]


class Database:
    """Cada leitura e cada gravação numa sessão própria do banco."""

    def __init__(self, sessionmaker: async_sessionmaker[AsyncSession]) -> None:
        self._sessionmaker = sessionmaker

    async def read[T](self, query: Callable[[AsyncSession], Awaitable[T]]) -> T:
        async with self._sessionmaker() as session:
            return await query(session)

    async def write[T](self, write: Callable[[AsyncSession], Awaitable[T]]) -> T:
        # Outra requisição pode criar as mesmas linhas ao mesmo tempo: na tentativa
        # seguinte elas já existem e viram update.
        attempt = 1
        while True:
            try:
                async with self._sessionmaker() as session:
                    result = await write(session)
                    await session.commit()
                    return result
            except IntegrityError:
                if attempt == _WRITE_ATTEMPTS:
                    raise
                attempt += 1


def get_database(sessionmaker: SessionmakerDep) -> Database:
    return Database(sessionmaker)


DatabaseDep = Annotated[Database, Depends(get_database)]


def create_schema(conn: Connection) -> None:
    Base.metadata.create_all(conn)
    # O `create_all` só cria os índices junto de uma tabela nova.
    for table in Base.metadata.sorted_tables:
        for index in table.indexes:
            index.create(conn, checkfirst=True)


async def create_tables() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(create_schema)


def db_init() -> None:
    asyncio.run(create_tables())
