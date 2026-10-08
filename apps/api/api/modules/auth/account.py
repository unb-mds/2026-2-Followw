from functools import partial

from sqlalchemy.ext.asyncio import AsyncSession

from api.cache import Freshness
from api.db.main import Database
from api.db.models import OwnLink, User
from api.modules.classrooms.repository import ClassroomRepository
from api.modules.classrooms.service import (
    classrooms_freshness,
    stale_classroom_tasks,
    sync_classrooms,
)
from api.modules.me.profile import profile_freshness, sync_profile
from api.modules.me.repository import UserRepository
from api.sigaa import SigaaConnection
from api.sync import Context
from api.sync.engine import Job, Step, Task
from api.sync.queue import QStashQueue


async def start_account(
    connection: SigaaConnection, db: Database, queue: QStashQueue
) -> None:
    """Confere a senha (logando, se não houver sessão) e agenda o sync do que venceu."""
    if not connection.authenticated:
        await connection.client()

    user, links = await db.read(partial(_account, connection.registration))
    if _stale_account_tasks(user) or any(stale_classroom_tasks(l) for l in links):
        job = Job(credentials=connection.credentials, steps=(Step.of(sync_account),))
        await queue.enqueue(job)


async def sync_account(ctx: Context[None]) -> None:
    """O sync do login: perfil, turmas e um job por turma com as telas vencidas."""
    account = partial(_account, ctx.sync.registration)
    user, _ = await ctx.sync.db.read(account)
    for task in _stale_account_tasks(user):
        await task(ctx)

    _, links = await ctx.sync.db.read(account)
    for link in links:
        for task in stale_classroom_tasks(link):
            ctx.sync.schedule(task, link)


async def _account(
    registration: str, session: AsyncSession
) -> tuple[User | None, list[OwnLink]]:
    user = await UserRepository(session).get_by_registration(registration)
    if user is None:
        return None, []
    return user, await ClassroomRepository(session).list_by_user_id(user.id)


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
