"""As aulas da semana das turmas atuais, com a situação do aluno em cada uma."""

from datetime import date, time, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import Depends
from pydantic import BaseModel, ConfigDict

from api import academic_calendar
from api.cache import Freshness, freshness
from api.db.enums import ClassroomRole, LessonStatus
from api.db.models import OwnLink
from api.modules.classrooms.frequency import sync_frequency
from api.modules.classrooms.repository import FrequencyRepository
from api.modules.classrooms.service import ClassroomServiceDep, details_ttl
from api.schemas import UserSubject
from api.sync import SyncDep


class LessonClassroom(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: str
    subject: UserSubject
    room: str | None


class WeekLesson(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: UUID
    start_time: time
    end_time: time
    # `None` onde o usuário não é aluno.
    status: LessonStatus | None
    marked: bool
    # Fora do plano: publicada pelo SIGAA, como uma reposição.
    scheduled: bool
    classroom: LessonClassroom


class LessonDay(BaseModel):
    model_config = ConfigDict(frozen=True)

    date: date
    # Feriado, recesso ou fora do período de aulas; só nos dias sem aulas.
    no_class_reason: str | None
    lessons: list[WeekLesson]


class WeekLessonsService:
    def __init__(self, sync: SyncDep, classrooms: ClassroomServiceDep) -> None:
        self._sync = sync
        self._classrooms = classrooms

    async def week(self) -> list[LessonDay]:
        """Segunda a domingo da semana atual; a frequência vencida só é agendada."""
        links = [
            link for link in await self._classrooms.list_links() if link.row.current
        ]
        for link in links:
            if _student(link) and _frequency_stale(link):
                self._sync.schedule(sync_frequency, link)

        today = academic_calendar.today()
        days = [today - timedelta(days=today.weekday() - n) for n in range(7)]
        rows = await self._sync.db.read(
            lambda session: FrequencyRepository(session).list_lessons(
                [link.row for link in links], between=(days[0], days[-1])
            )
        )
        lessons: dict[date, list[WeekLesson]] = {day: [] for day in days}
        for link in links:
            for lesson, attendance in rows[link.row.classroom_id]:
                day = lessons.get(lesson.occurred_on)
                if day is None or lesson.start_time is None or lesson.end_time is None:
                    continue
                status = (
                    attendance.status if attendance else LessonStatus.NAO_REGISTRADA
                )
                student = _student(link)
                day.append(
                    WeekLesson(
                        id=lesson.id,
                        start_time=lesson.start_time,
                        end_time=lesson.end_time,
                        status=status if student else None,
                        marked=bool(student and attendance and attendance.marked),
                        scheduled=lesson.scheduled,
                        classroom=_classroom(link),
                    )
                )
        return [
            LessonDay(
                date=day,
                no_class_reason=None
                if items
                else academic_calendar.no_class_reason(day),
                lessons=sorted(
                    items,
                    key=lambda item: (item.start_time, item.classroom.subject.name),
                ),
            )
            for day, items in lessons.items()
        ]


def _student(link: OwnLink) -> bool:
    return link.row.role == ClassroomRole.ALUNO


def _frequency_stale(link: OwnLink) -> bool:
    synced_at = link.row.frequency_synced_at
    return freshness(synced_at, details_ttl(link)) is Freshness.STALE


def _classroom(link: OwnLink) -> LessonClassroom:
    classroom = link.row.classroom
    return LessonClassroom(
        id=link.front_end_id,
        subject=UserSubject(code=classroom.subject.code, name=classroom.subject.name),
        room=classroom.room,
    )


WeekLessonsServiceDep = Annotated[WeekLessonsService, Depends()]
