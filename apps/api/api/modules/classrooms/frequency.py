from datetime import UTC, date, datetime
from typing import Annotated

from fastapi import Depends
from pydantic import BaseModel, ValidationError
from sigaa_client import ClassroomFrequency
from sqlalchemy.ext.asyncio import AsyncSession

from api import academic_calendar
from api.cache import freshness
from api.db.enums import LessonStatus
from api.db.models import OwnLink
from api.modules.classrooms.lessons import ClassroomFrequencyView, Marks
from api.modules.classrooms.repository import FrequencyRepository
from api.modules.classrooms.service import (
    ClassroomServiceDep,
    UserClassroom,
    details_ttl,
    to_classroom,
)
from api.sync import Cached, Context, SyncDep


async def sync_frequency(ctx: Context[OwnLink]) -> None:
    link = ctx.target
    frequency = await ctx.client.classrooms.get_classroom_frequency(link.front_end_id)
    await ctx.sync.db.write(
        lambda session: FrequencyRepository(session).save(
            link.row.id, frequency, datetime.now(UTC)
        )
    )


class ClassroomFrequencyResult(BaseModel):
    classroom: UserClassroom
    frequency: ClassroomFrequencyView


class FrequencyService:
    def __init__(self, sync: SyncDep, classrooms: ClassroomServiceDep) -> None:
        self._sync = sync
        self._classrooms = classrooms

    async def get_frequency(self, classroom_id: str) -> ClassroomFrequencyView:
        link = await self._classrooms.get_link(classroom_id)
        [view] = await self._views([link])
        return view

    async def list_frequencies(self) -> list[ClassroomFrequencyResult]:
        links = await self._classrooms.list_links()
        return [
            ClassroomFrequencyResult(classroom=to_classroom(link), frequency=view)
            for link, view in zip(links, await self._views(links), strict=True)
        ]

    async def mark_lesson(
        self,
        classroom_id: str,
        occurred_on: date,
        position: int,
        status: LessonStatus,
    ) -> None:
        link = await self._classrooms.get_link(classroom_id)
        await self._sync.db.write(
            lambda session: FrequencyRepository(session).save_mark(
                link.row.id, occurred_on, position, status
            )
        )

    async def unmark_lesson(
        self, classroom_id: str, occurred_on: date, position: int
    ) -> None:
        link = await self._classrooms.get_link(classroom_id)
        await self._sync.db.write(
            lambda session: FrequencyRepository(session).delete_mark(
                link.row.id, occurred_on, position
            )
        )

    async def _views(self, links: list[OwnLink]) -> list[ClassroomFrequencyView]:
        marks = await self._sync.db.read(
            lambda session: FrequencyRepository(session).list_marks(
                [link.row.id for link in links]
            )
        )
        # Em sequência: as turmas dividem a sessão do SIGAA.
        return [await self._view(link, marks[link.row.id]) for link in links]

    async def _view(self, link: OwnLink, marks: Marks) -> ClassroomFrequencyView:
        async def load(session: AsyncSession) -> Cached[ClassroomFrequency] | None:
            cached = await FrequencyRepository(session).get(link.row.id)
            if cached is None:
                return None
            try:
                frequency = ClassroomFrequency.model_validate(cached.data)
            except ValidationError:
                return None
            return Cached(
                frequency,
                cached.synced_at,
                freshness(cached.synced_at, details_ttl(link)),
            )

        frequency = await self._sync.resolve(sync_frequency, link, load)
        classroom = link.row.classroom
        return ClassroomFrequencyView.build(
            frequency,
            marks,
            schedule=classroom.schedule,
            subject_hours=classroom.subject.hours,
            # Só a turma atual tem aulas previstas; as marcações valem em qualquer uma.
            days=academic_calendar.class_days(classroom.semester)
            if link.row.current
            else (),
        )


FrequencyServiceDep = Annotated[FrequencyService, Depends()]
