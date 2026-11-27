from datetime import datetime
from functools import partial

from sigaa_client import Credentials
from sqlalchemy.ext.asyncio import AsyncSession

from api.cache import Freshness
from api.db.account_data import SyncDatabase
from api.db.main import Database
from api.db.models import OwnLink, User
from api.modules.classrooms.repository import ClassroomRepository
from api.modules.classrooms.service import (
    classrooms_freshness,
    grades_freshness,
    stale_classroom_tasks,
    sync_classrooms,
    sync_grades,
)
from api.modules.me.profile import profile_freshness, sync_profile
from api.modules.me.repository import UserRepository
from api.sigaa import SigaaConnection
from api.sync import Context
from api.sync.engine import Job, Step, Task, run_task
from api.sync.queue import QStashQueue


async def start_account(
    connection: SigaaConnection,
    db: Database,
    queue: QStashQueue,
    *,
    started_at: datetime,
) -> None:
    """Confere a senha (logando, se não houver sessão) e agenda o sync do que venceu."""
    if not connection.authenticated:
        await connection.client()
    await schedule_account_sync(
        connection.credentials, db, queue, started_at=started_at
    )


async def schedule_account_sync(
    credentials: Credentials,
    db: Database,
    queue: QStashQueue,
    *,
    started_at: datetime,
) -> None:
    account_db = SyncDatabase(db, credentials.registration, started_at)
    await account_db.write(
        lambda session: UserRepository(session).register(credentials.registration)
    )
    user, links = await account_db.read(partial(_account, credentials.registration))
    if (
        _stale_account_tasks(user)
        or _stale_grades(user)
        or any(stale_classroom_tasks(l) for l in links)
    ):
        version = await account_db.check_current()
        job = Job(
            credentials=credentials,
            steps=(Step.of(sync_account),),
            created_at=started_at,
            data_version=version,
        )
        await queue.enqueue(job)


async def sync_account(ctx: Context[None]) -> None:
    """Perfil, turmas e menções na sessão principal; detalhes em jobs por turma."""
    account = partial(_account, ctx.sync.registration)
    user, _ = await ctx.sync.db.read(account)
    for task in _stale_account_tasks(user):
        await run_task(task, ctx)

    user, links = await ctx.sync.db.read(account)
    for link in links:
        for task in stale_classroom_tasks(link):
            ctx.sync.schedule(task, link)
    if _stale_grades(user):
        await run_task(sync_grades, ctx)


async def _account(
    registration: str, session: AsyncSession
) -> tuple[User | None, list[OwnLink]]:
    user = await UserRepository(session).get_by_registration(registration)
    if user is None:
        return None, []
    return user, await ClassroomRepository(session).list_by_user_id(user.id)


def _stale_grades(user: User | None) -> bool:
    synced_at = user.grades_synced_at if user else None
    return grades_freshness(synced_at) is Freshness.STALE


def _stale_account_tasks(user: User | None) -> list[Task[None]]:
    """Perfil antes das turmas: as turmas penduram no usuário."""
    if user is None:
        return [sync_profile, sync_classrooms]
    stale: list[Task[None]] = []
    if profile_freshness(user.profile_synced_at) is Freshness.STALE:
        stale.append(sync_profile)
    if classrooms_freshness(user.classrooms_synced_at) is Freshness.STALE:
        stale.append(sync_classrooms)
    return stale
