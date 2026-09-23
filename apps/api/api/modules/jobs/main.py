from fastapi import APIRouter, status

from api.dependencies.qstash import JobDep
from api.dependencies.sync import JobEngineDep

router = APIRouter()


@router.post("", status_code=status.HTTP_204_NO_CONTENT, include_in_schema=False)
async def run_job(job: JobDep, engine: JobEngineDep) -> None:
    """Destino dos jobs publicados no QStash."""
    await engine.run(job)
