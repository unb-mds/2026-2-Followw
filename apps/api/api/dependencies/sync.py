from collections.abc import AsyncGenerator
from typing import Annotated

import httpx
from fastapi import Depends, HTTPException, status
from sigaa_client import SigaaError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from api.db.main import get_sessionmaker
from api.dependencies.qstash import JobDep, JobQueueDep
from api.dependencies.sigaa import SigaaConnection, SigaaConnectionDep
from api.services.sync import SyncEngine

SessionmakerDep = Annotated[async_sessionmaker[AsyncSession], Depends(get_sessionmaker)]


def get_sync_engine(
    sessionmaker: SessionmakerDep, sigaa: SigaaConnectionDep, queue: JobQueueDep
) -> SyncEngine:
    return SyncEngine(sessionmaker, sigaa, queue)


SyncEngineDep = Annotated[SyncEngine, Depends(get_sync_engine)]


async def get_job_engine(
    job: JobDep, sessionmaker: SessionmakerDep, queue: JobQueueDep
) -> AsyncGenerator[SyncEngine]:
    connection = SigaaConnection(job.registration, job.session_token)
    try:
        yield SyncEngine(sessionmaker, connection, queue)
    except SigaaError, httpx.HTTPError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail="SIGAA is unavailable"
        )
    finally:
        await connection.aclose()


JobEngineDep = Annotated[SyncEngine, Depends(get_job_engine)]
