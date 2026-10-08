from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from api import academic_calendar
from api.cache import freshness
from api.db.enums import LessonStatus
from api.db.models import OwnLink
from api.modules.classrooms.lessons import (
    ClassroomFrequencyView,
    FrequencySummary,
    Timetable,
)
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
    classroom = link.row.classroom
    timetable = Timetable.parse(classroom.schedule)
    days = list(academic_calendar.class_days(classroom.semester))
    await ctx.sync.db.write(
        lambda session: FrequencyRepository(session).save(
            link.row.id, frequency, timetable, days, datetime.now(UTC)
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
        self, classroom_id: str, lesson_id: UUID, status: LessonStatus
    ) -> None:
        link = await self._classrooms.get_link(classroom_id)

        async def write(session: AsyncSession) -> None:
            repository = FrequencyRepository(session)
            lesson = await repository.get_lesson(link.row.classroom_id, lesson_id)
            if lesson is None:
                raise HTTPException(404, "Aula não encontrada na turma.")
            if lesson.occurred_on >= academic_calendar.today():
                raise HTTPException(422, "A aula ainda não aconteceu.")
            if not await repository.save_mark(link.row.user_id, lesson.id, status):
                raise HTTPException(409, "O SIGAA já registrou a chamada desta aula.")

        await self._sync.db.write(write)

    async def unmark_lesson(self, classroom_id: str, lesson_id: UUID) -> None:
        link = await self._classrooms.get_link(classroom_id)

        async def write(session: AsyncSession) -> None:
            repository = FrequencyRepository(session)
            if await repository.get_lesson(link.row.classroom_id, lesson_id) is None:
                raise HTTPException(404, "Aula não encontrada na turma.")
            await repository.delete_mark(link.row.user_id, lesson_id)

        await self._sync.db.write(write)

    async def _views(self, links: list[OwnLink]) -> list[ClassroomFrequencyView]:
        # Em sequência: as turmas dividem a sessão do SIGAA.
        summaries = [await self._summary(link) for link in links]
        if not links:
            return []
        lessons = await self._sync.db.read(
            lambda session: FrequencyRepository(session).list_lessons(
                links[0].row.user_id, [link.row.classroom_id for link in links]
            )
        )
        today = academic_calendar.today()
        return [
            ClassroomFrequencyView.build(
                summary,
                lessons[link.row.classroom_id],
                subject_hours=link.row.classroom.subject.hours,
                today=today,
            )
            for link, summary in zip(links, summaries, strict=True)
        ]

    async def _summary(self, link: OwnLink) -> FrequencySummary:
        async def load(session: AsyncSession) -> Cached[FrequencySummary] | None:
            saved = await FrequencyRepository(session).get_summary(link.row.id)
            if saved is None:
                return None
            summary, synced_at = saved
            return Cached(summary, synced_at, freshness(synced_at, details_ttl(link)))

        return await self._sync.resolve(sync_frequency, link, load)


FrequencyServiceDep = Annotated[FrequencyService, Depends()]
