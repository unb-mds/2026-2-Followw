"""As aulas da turma: as do SIGAA, as previstas pelo horário e as marcadas pelo aluno."""

import re
from collections import Counter
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import date
from typing import Self

from pydantic import BaseModel, ConfigDict
from sigaa_client import (
    ClassroomAttendance,
    ClassroomFrequency,
    ClassroomProgress,
    FrequencyStatus,
)

from api.db.enums import LessonStatus

_SCHEDULE = re.compile(r"([1-7]+)([MTN])([1-6]+)")
# Os horários do dia, em ordem: horários consecutivos são uma aula só, como `M5T1`.
_SLOTS = [
    f"{shift}{slot}"
    for shift, count in (("M", 5), ("T", 6), ("N", 4))
    for slot in range(1, count + 1)
]

type Marks = Mapping[tuple[date, int], LessonStatus]


class Lesson(BaseModel):
    """Uma aula; `position` a distingue das outras do mesmo dia."""

    model_config = ConfigDict(frozen=True)

    occurred_on: date
    position: int
    status: LessonStatus
    # Horas-aula pelo horário da turma.
    hours: int
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


class ClassroomFrequencyView(BaseModel):
    model_config = ConfigDict(frozen=True)

    progress: ClassroomProgress
    frequency_status: FrequencyStatus
    lessons: tuple[Lesson, ...]
    totals: FrequencyTotals | None

    @classmethod
    def build(
        cls,
        frequency: ClassroomFrequency,
        marks: Marks,
        *,
        schedule: str | None,
        subject_hours: int | None,
        days: Iterable[date] = (),
    ) -> Self:
        """As aulas do SIGAA, as previstas nos `days` e as marcadas, com os totais."""
        lessons = _lessons(frequency.frequency, Timetable.parse(schedule), marks, days)
        return cls(
            progress=frequency.progress,
            frequency_status=frequency.frequency_status,
            lessons=lessons,
            totals=_totals(frequency.frequency, lessons, subject_hours),
        )


@dataclass(frozen=True)
class Timetable:
    """As aulas de cada dia da semana (0 = segunda), com as horas-aula de cada uma."""

    sessions: Mapping[int, tuple[int, ...]]
    # Tamanho mais comum das aulas, que vale para as fora do horário (reposições).
    usual: int = 1

    @classmethod
    def parse(cls, schedule: str | None) -> Timetable:
        slots: dict[int, set[int]] = {}
        for days, shift, numbers in _SCHEDULE.findall(schedule or ""):
            indexes = {_SLOTS.index(shift + n) for n in numbers if shift + n in _SLOTS}
            # No SIGAA, 1 é domingo e 2 é segunda.
            for day in days if indexes else ():
                slots.setdefault((int(day) - 2) % 7, set()).update(indexes)

        sessions = {weekday: _runs(indexes) for weekday, indexes in slots.items()}
        usual = Counter(hours for day in sessions.values() for hours in day)
        return cls(sessions, usual.most_common(1)[0][0] if usual else 1)

    def lessons_on(self, day: date) -> int:
        return len(self.sessions.get(day.weekday(), ()))

    def hours(self, day: date, position: int) -> int:
        day_sessions = self.sessions.get(day.weekday(), ())
        return day_sessions[position] if position < len(day_sessions) else self.usual

    def lesson(
        self,
        day: date,
        position: int,
        status: LessonStatus,
        *,
        absences: int | None = None,
        marked: bool = False,
    ) -> Lesson:
        """Sem `absences`, a falta conta todas as horas-aula da aula."""
        hours = self.hours(day, position)
        if absences is None:
            absences = hours if status is LessonStatus.FALTA else 0
        return Lesson(
            occurred_on=day,
            position=position,
            status=status,
            hours=hours,
            absences=absences,
            marked=marked,
        )


def max_absences(hours: int | None) -> int | None:
    return max(hours * 4 // 15 - 2, 0) if hours else None


def _lessons(
    attendance: ClassroomAttendance | None,
    timetable: Timetable,
    marks: Marks,
    days: Iterable[date],
) -> tuple[Lesson, ...]:
    """Mais recentes primeiro."""
    lessons: dict[tuple[date, int], Lesson] = {}
    positions: Counter[date] = Counter()
    for entry in attendance.entries if attendance else ():
        position = positions[entry.occurred_on]
        positions[entry.occurred_on] += 1
        lessons[entry.occurred_on, position] = timetable.lesson(
            entry.occurred_on,
            position,
            LessonStatus(entry.status.value),
            absences=entry.absences,
        )
    for day in days:
        for position in range(timetable.lessons_on(day)):
            lessons.setdefault(
                (day, position),
                timetable.lesson(day, position, LessonStatus.NAO_REGISTRADA),
            )
    for (day, position), status in marks.items():
        official = lessons.get((day, position))
        if official is None or official.status is LessonStatus.NAO_REGISTRADA:
            lessons[day, position] = timetable.lesson(
                day, position, status, marked=True
            )
    return tuple(sorted(lessons.values(), key=_order, reverse=True))


def _totals(
    attendance: ClassroomAttendance | None,
    lessons: Iterable[Lesson],
    subject_hours: int | None,
) -> FrequencyTotals | None:
    """`None` enquanto não há aula com presença ou falta.

    Na porcentagem, a aula sem chamada vale como presença: só a falta a tira.
    """
    attended = registered = presences = absences = recorded = 0
    if attendance:
        summary = attendance.summary
        attended, registered = attendance.attended, attendance.registered
        recorded = summary.recorded_entries
        presences = recorded - summary.absence_entries
        absences = summary.total_absences
    estimated = False
    for lesson in lessons:
        if lesson.status is LessonStatus.NAO_REGISTRADA:
            registered += lesson.hours
            attended += lesson.hours
        elif lesson.marked and lesson.status is not LessonStatus.CANCELADA:
            estimated = True
            registered += lesson.hours
            if lesson.status is LessonStatus.PRESENTE:
                attended += lesson.hours
                presences += 1
            absences += lesson.absences

    if not estimated and not recorded:
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


def _runs(slots: set[int]) -> tuple[int, ...]:
    """O tamanho de cada sequência de horários consecutivos."""
    runs: list[int] = []
    for slot in sorted(slots):
        if slot - 1 in slots:
            runs[-1] += 1
        else:
            runs.append(1)
    return tuple(runs)
