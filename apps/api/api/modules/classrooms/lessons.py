"""As aulas da turma: as do SIGAA, as previstas pelo horário e as marcadas pelo aluno."""

import enum
import re
from collections import Counter
from collections.abc import Iterable, Iterator, Mapping
from dataclasses import dataclass
from datetime import date, timedelta

from pydantic import BaseModel, ConfigDict
from sigaa_client import ClassroomFrequency
from unb_browser import CalendarEventCategory, load_academic_calendar

from api import academic_calendar
from api.db.enums import LessonMarkStatus

_SCHEDULE = re.compile(r"([1-7]+)([MTN])([1-6]+)")
# Início e fim de cada horário, em minutos do dia, como em `apps/web/src/lib/schedule.ts`.
_SLOTS = {
    "M": ((480, 535), (535, 590), (600, 655), (655, 710), (720, 775)),
    "T": ((775, 830), (840, 895), (895, 950), (960, 1015), (1015, 1070), (1080, 1135)),
    "N": ((1140, 1190), (1190, 1240), (1250, 1300), (1300, 1350)),
}
_NO_CLASS = {
    CalendarEventCategory.HOLIDAY,
    CalendarEventCategory.OPTIONAL_HOLIDAY,
    CalendarEventCategory.UNIVERSITY_WEEK,
}

type Marks = Mapping[tuple[date, int], LessonMarkStatus]


class LessonStatus(str, enum.Enum):
    PRESENTE = "presente"
    FALTA = "falta"
    NAO_REGISTRADA = "nao_registrada"
    CANCELADA = "cancelada"


class Lesson(BaseModel):
    """Uma aula; `position` a distingue das outras do mesmo dia."""

    model_config = ConfigDict(frozen=True)

    occurred_on: date
    position: int
    status: LessonStatus
    # Horas-aula de falta, como o SIGAA conta.
    absences: int = 0
    # Situação marcada pelo aluno numa aula que o SIGAA não registrou.
    marked: bool = False


class FrequencyTotals(BaseModel):
    """Presenças, faltas e frequência do SIGAA somadas às aulas marcadas pelo aluno."""

    model_config = ConfigDict(frozen=True)

    presences: int
    absences: int
    percentage: float
    # Faltas (horas-aula) que a turma comporta; `None` sem a carga horária.
    max_absences: int | None
    estimated: bool


@dataclass(frozen=True)
class Timetable:
    """As aulas de cada dia da semana (0 = segunda), com as horas-aula de cada uma."""

    sessions: Mapping[int, tuple[int, ...]]

    @classmethod
    def parse(cls, schedule: str | None) -> Timetable:
        blocks: dict[int, list[tuple[int, int, int]]] = {}
        for days, shift, slots in _SCHEDULE.findall(schedule or ""):
            ranges = [
                _SLOTS[shift][int(slot) - 1]
                for slot in slots
                if int(slot) <= len(_SLOTS[shift])
            ]
            if not ranges:
                continue
            # No SIGAA, 1 é domingo e 2 é segunda.
            for day in days:
                blocks.setdefault((int(day) - 2) % 7, []).append(
                    (ranges[0][0], ranges[-1][1], len(ranges))
                )

        sessions = {}
        for weekday, day_blocks in blocks.items():
            # Blocos colados no mesmo dia, como `M5T1`, são uma aula só.
            merged: list[tuple[int, int, int]] = []
            for start, end, hours in sorted(day_blocks):
                if merged and merged[-1][1] == start:
                    merged[-1] = (merged[-1][0], end, merged[-1][2] + hours)
                else:
                    merged.append((start, end, hours))
            sessions[weekday] = tuple(hours for _, _, hours in merged)
        return cls(sessions)

    def lessons_on(self, day: date) -> int:
        return len(self.sessions.get(day.weekday(), ()))

    def hours(self, day: date, position: int) -> int:
        day_sessions = self.sessions.get(day.weekday(), ())
        if position < len(day_sessions):
            return day_sessions[position]
        # Aula fora do horário, como uma reposição: vale o tamanho usual das aulas.
        usual = Counter(hours for day in self.sessions.values() for hours in day)
        return usual.most_common(1)[0][0] if usual else 1


def class_days(semester: str, *, on: date | None = None) -> Iterator[date]:
    """Os dias letivos do semestre até ontem, sem feriados e semana universitária."""
    calendar = load_academic_calendar().get_semester(semester)
    if calendar is None:
        return
    start = calendar.classes.start
    end = min(
        calendar.classes.end, (on or academic_calendar.today()) - timedelta(days=1)
    )
    no_class = {
        day
        for event in calendar.events
        if event.category in _NO_CLASS
        for day in _days(max(event.start_date, start), min(event.end_date, end))
    }
    for day in _days(start, end):
        if day not in no_class:
            yield day


def build_lessons(
    frequency: ClassroomFrequency,
    timetable: Timetable,
    marks: Marks,
    days: Iterable[date] = (),
) -> tuple[Lesson, ...]:
    """As aulas do SIGAA, as previstas nos `days` e as marcadas, mais recentes primeiro."""
    lessons: dict[tuple[date, int], Lesson] = {}
    positions: Counter[date] = Counter()
    for entry in frequency.frequency.entries if frequency.frequency else ():
        position = positions[entry.occurred_on]
        positions[entry.occurred_on] += 1
        lessons[entry.occurred_on, position] = Lesson(
            occurred_on=entry.occurred_on,
            position=position,
            status=LessonStatus(entry.status.value),
            absences=entry.absences,
        )
    for day in days:
        for position in range(timetable.lessons_on(day)):
            lessons.setdefault(
                (day, position),
                Lesson(
                    occurred_on=day,
                    position=position,
                    status=LessonStatus.NAO_REGISTRADA,
                ),
            )
    for (day, position), status in marks.items():
        official = lessons.get((day, position))
        if official is not None and official.status is not LessonStatus.NAO_REGISTRADA:
            continue
        lessons[day, position] = Lesson(
            occurred_on=day,
            position=position,
            status=LessonStatus(status.value),
            absences=timetable.hours(day, position)
            if status is LessonMarkStatus.FALTA
            else 0,
            marked=True,
        )
    return tuple(sorted(lessons.values(), key=_order, reverse=True))


def max_absences(hours: int | None) -> int | None:
    return max(hours * 4 // 15 - 2, 0) if hours else None


def frequency_totals(
    frequency: ClassroomFrequency,
    lessons: Iterable[Lesson],
    timetable: Timetable,
    subject_hours: int | None,
) -> FrequencyTotals | None:
    """`None` enquanto não há aula com presença ou falta.

    Na porcentagem, a aula sem chamada vale como presença: só a falta a tira.
    """
    attendance = frequency.frequency
    summary = attendance.summary if attendance else None
    attended = attendance.attended if attendance else 0
    registered = attendance.registered if attendance else 0
    presences = summary.recorded_entries - summary.absence_entries if summary else 0
    absences = summary.total_absences if summary else 0
    estimated = False
    for lesson in lessons:
        if lesson.status is LessonStatus.CANCELADA:
            continue
        lesson_hours = timetable.hours(lesson.occurred_on, lesson.position)
        if lesson.status is LessonStatus.NAO_REGISTRADA:
            registered += lesson_hours
            attended += lesson_hours
            continue
        if not lesson.marked:
            continue
        registered += lesson_hours
        if lesson.status is LessonStatus.PRESENTE:
            attended += lesson_hours
            presences += 1
        else:
            absences += lesson_hours
        estimated = True

    if not estimated and not (summary and summary.recorded_entries):
        return None
    return FrequencyTotals(
        presences=presences,
        absences=absences,
        percentage=round(attended * 100 / registered, 1) if registered else 0,
        max_absences=max_absences(subject_hours),
        estimated=estimated,
    )


def _order(lesson: Lesson) -> tuple[date, int]:
    return lesson.occurred_on, lesson.position


def _days(start: date, end: date) -> Iterator[date]:
    day = start
    while day <= end:
        yield day
        day += timedelta(days=1)
