from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends
from sigaa_client import ClassroomTeachingPlan
from sqlalchemy.ext.asyncio import AsyncSession

from api.cache import freshness
from api.db.models import OwnLink
from api.modules.classrooms.repository import ClassroomRepository
from api.modules.classrooms.service import ClassroomServiceDep, details_ttl
from api.sync import Cached, Context, SyncDep


async def sync_teaching_plan(ctx: Context[OwnLink]) -> None:
    link = ctx.target
    plan = await ctx.client.classrooms.get_classroom_teaching_plan(link.front_end_id)
    await ctx.sync.db.write(
        lambda session: ClassroomRepository(session).save_teaching_plan(
            link.row.classroom_id, plan, datetime.now(UTC)
        )
    )


class TeachingPlanService:
    def __init__(self, sync: SyncDep, classrooms: ClassroomServiceDep) -> None:
        self._sync = sync
        self._classrooms = classrooms

    async def get_plan(self, classroom_id: str) -> ClassroomTeachingPlan | None:
        link = await self._classrooms.get_link(classroom_id)

        async def load(
            session: AsyncSession,
        ) -> Cached[ClassroomTeachingPlan | None] | None:
            classroom = await ClassroomRepository(session).get_teaching_plan(
                link.row.classroom_id
            )
            if classroom is None or classroom.teaching_plan_synced_at is None:
                return None
            plan = (
                ClassroomTeachingPlan.model_validate(classroom.teaching_plan)
                if classroom.teaching_plan is not None
                else None
            )
            return Cached(
                plan,
                classroom.teaching_plan_synced_at,
                freshness(classroom.teaching_plan_synced_at, details_ttl(link)),
            )

        return await self._sync.resolve(sync_teaching_plan, link, load)


TeachingPlanServiceDep = Annotated[TeachingPlanService, Depends()]
