import logging
from functools import partial

from fastapi import APIRouter, HTTPException, status
from sigaa_client import AuthenticationFailed
from sqlalchemy.exc import IntegrityError

from api.db.main import DatabaseDep
from api.logger import event, operation
from api.modules.auth.account import sync_account
from api.modules.classrooms.frequency import sync_frequency
from api.modules.classrooms.news import sync_news, sync_news_content
from api.modules.classrooms.service import (
    find_link,
    sync_classrooms,
    sync_grade,
    sync_members,
    sync_statistics,
)
from api.modules.me.profile import sync_profile
from api.sigaa import SigaaConnection
from api.sync import Sync
from api.sync.engine import (
    GONE_ERRORS,
    ORIGIN_ERRORS,
    Context,
    Job,
    Step,
    Task,
    run_task,
)
from api.sync.queue import JobDep, JobQueueDep

router = APIRouter()

TASKS: dict[str, Task] = {
    task.__name__: task
    for task in (
        sync_account,
        sync_profile,
        sync_classrooms,
        sync_members,
        sync_statistics,
        sync_frequency,
        sync_grade,
        sync_news,
        sync_news_content,
    )
}
# A primeira tentativa e uma retentativa só com as tarefas que falharam.
MAX_ATTEMPTS = 2


@router.post("", status_code=status.HTTP_204_NO_CONTENT, include_in_schema=False)
async def run_job(job: JobDep, db: DatabaseDep, queue: JobQueueDep) -> None:
    """Destino dos jobs do QStash: loga numa sessão própria, roda as tarefas e sai."""
    if any(step.task not in TASKS for step in job.steps):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown task"
        )

    with operation("job", attempt=job.attempt, step_count=len(job.steps)):
        sigaa = SigaaConnection(job.credentials)
        sync = Sync(db, sigaa)
        try:
            failed = await _run(job, sigaa, sync)
        finally:
            await sigaa.aclose(logout=True)

        jobs = sync.jobs()
        if failed and job.attempt < MAX_ATTEMPTS:
            jobs.append(
                job.model_copy(update={"steps": failed, "attempt": job.attempt + 1})
            )
        event("job.result", failed_count=len(failed), job_count=len(jobs))
        await queue.enqueue(*jobs)


async def _run(job: Job, sigaa: SigaaConnection, sync: Sync) -> tuple[Step, ...]:
    """Roda as tarefas e devolve as que falharam por culpa da origem."""
    try:
        client = await sigaa.client()
    except AuthenticationFailed:
        event("job.authentication_rejected")
        return ()
    except ORIGIN_ERRORS:
        event("job.login_failed", level=logging.WARNING)
        return job.steps

    link = None
    if job.classroom_id is not None:
        link, _ = await sync.db.read(
            partial(find_link, job.registration, job.classroom_id)
        )
        # A turma pode ter saído da lista do usuário depois de agendada.
        if link is None:
            event("job.skipped")
            return ()

    failed = []
    for step in job.steps:
        try:
            await run_task(TASKS[step.task], Context(client, sync, step.target(link)))
        except AuthenticationFailed:
            event("job.authentication_rejected", task=step.task)
            return ()
        except (*GONE_ERRORS, IntegrityError):
            # Sumiu do SIGAA, ou outro sync já gravou: tentar de novo não muda nada.
            event("sync.task.discarded", task=step.task)
        except ORIGIN_ERRORS:
            event("sync.task.retry_pending", level=logging.WARNING, task=step.task)
            failed.append(step)
    return tuple(failed)
