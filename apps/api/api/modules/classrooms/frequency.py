from datetime import UTC, date, datetime
from typing import Annotated

from fastapi import Depends
from pydantic import ValidationError
from sigaa_client import ClassroomFrequency
from sqlalchemy.ext.asyncio import AsyncSession

from api.cache import freshness
from api.db.enums import LessonMarkStatus
from api.db.models import OwnLink
from api.modules.classrooms.lessons import (
    FrequencyTotals,
    Lesson,
    Timetable,
    build_lessons,
    class_days,
    frequency_totals,
)
from api.modules.classrooms.repository import ClassroomRepository, FrequencyRepository
from api.modules.classrooms.service import (
    ClassroomServiceDep,
    UserClassroom,
    details_ttl,
)
from api.sync import Cached, Context, SyncDep


async def sync_frequency(ctx: Context[OwnLink]) -> None:
    link = ctx.target
    frequency = await ctx.client.classrooms.get_classroom_frequency(link.front_end_id)
    await ctx.sync.db.write(
        lambda session: FrequencyRepository(session).save(
            link.row.id, link.row.classroom_id, frequency, datetime.now(UTC)
        )
    )


class ClassroomFrequencyView(ClassroomFrequency):
    lessons: tuple[Lesson, ...] = ()
    totals: FrequencyTotals | None = None


class ClassroomFrequencyResult(ClassroomFrequencyView):
    classroom: UserClassroom


class FrequencyService:
    def __init__(self, sync: SyncDep, classrooms: ClassroomServiceDep) -> None:
        self._sync = sync
        self._classrooms = classrooms

    async def get_frequency(self, classroom_id: str) -> ClassroomFrequencyView:
        link = await self._classrooms.get_link(classroom_id)

        async def load(session: AsyncSession) -> Cached[ClassroomFrequency] | None:
            cached = await FrequencyRepository(session).get(link.row.id)
            classroom = await ClassroomRepository(session).get(link.row.classroom_id)
            if cached is None or classroom is None or classroom.progress is None:
                return None
            try:
                frequency = ClassroomFrequency(
                    progress=classroom.progress, frequency=cached.frequency
                )
            except ValidationError:
                return None
            return Cached(
                frequency,
                cached.synced_at,
                freshness(cached.synced_at, details_ttl(link)),
            )

        frequency = await self._sync.resolve(sync_frequency, link, load)
        marks = await self._sync.db.read(
            lambda session: FrequencyRepository(session).list_marks(link.row.id)
        )
        classroom = link.row.classroom
        timetable = Timetable.parse(classroom.schedule)
        # Só a turma atual tem aulas previstas; as marcações valem em qualquer uma.
        days = class_days(classroom.semester) if link.row.current else ()
        lessons = build_lessons(frequency, timetable, marks, days)
        return ClassroomFrequencyView(
            **dict(frequency),
            lessons=lessons,
            totals=frequency_totals(
                frequency, lessons, timetable, classroom.subject.hours
            ),
        )

    async def list_frequencies(self) -> list[ClassroomFrequencyResult]:
        return [
            ClassroomFrequencyResult(
                classroom=classroom, **dict(await self.get_frequency(classroom.id))
            )
            for classroom in await self._classrooms.list_classrooms()
        ]

    async def mark_lesson(
        self,
        classroom_id: str,
        occurred_on: date,
        position: int,
        status: LessonMarkStatus,
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


FrequencyServiceDep = Annotated[FrequencyService, Depends()]
