"""As aulas da turma: o plano pelo horário e calendário e a situação do aluno em cada uma."""

import re
from collections import Counter
from collections.abc import Iterable, Iterator, Mapping
from dataclasses import dataclass
from datetime import date, time
from typing import Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict
from sigaa_client import (
    AttendanceEntry,
    ClassroomFrequency,
    ClassroomProgress,
    FrequencyStatus,
)

from api.db import models
from api.db.enums import LessonStatus

_SCHEDULE = re.compile(r"([1-7]+)([MTN])([1-6]+)")
# Início e fim dos horários do dia, em ordem: horários consecutivos são uma aula só, como `M5T1`.
_SLOTS = {
    "M1": (time(8, 0), time(8, 55)),
    "M2": (time(8, 55), time(9, 50)),
    "M3": (time(10, 0), time(10, 55)),
    "M4": (time(10, 55), time(11, 50)),
    "M5": (time(12, 0), time(12, 55)),
    "T1": (time(12, 55), time(13, 50)),
    "T2": (time(14, 0), time(14, 55)),
    "T3": (time(14, 55), time(15, 50)),
    "T4": (time(16, 0), time(16, 55)),
    "T5": (time(16, 55), time(17, 50)),
    "T6": (time(18, 0), time(18, 55)),
    "N1": (time(19, 0), time(19, 50)),
    "N2": (time(19, 50), time(20, 40)),
    "N3": (time(20, 50), time(21, 40)),
    "N4": (time(21, 40), time(22, 30)),
}
_ORDER = list(_SLOTS)


def hours(start: time | None, end: time | None) -> int:
    """Horas-aula entre `start` e `end`; uma, sem o horário."""
    if start is None or end is None:
        return 1
    return sum(start <= s and e <= end for s, e in _SLOTS.values()) or 1


@dataclass(frozen=True)
class Period:
    start: time
    end: time


class Lesson(BaseModel):
    """Uma aula; sem horário quando o SIGAA a publicou numa turma sem horário."""

    model_config = ConfigDict(frozen=True)

    id: UUID
    occurred_on: date
    start_time: time | None
    end_time: time | None
    status: LessonStatus
    # Horas-aula de falta, como o SIGAA conta.
    absences: int = 0
    # Situação marcada pelo aluno numa aula que o SIGAA não registrou.
    marked: bool = False

    @property
    def hours(self) -> int:
        return hours(self.start_time, self.end_time)


class FrequencyTotals(BaseModel):
    """Presenças, faltas e frequência do SIGAA somadas às aulas marcadas pelo aluno."""

    model_config = ConfigDict(frozen=True)

    presences: int
    absences: int
    percentage: float
    # Faltas (horas-aula) que a turma comporta; `None` sem a carga horária.
    max_absences: int | None
    estimated: bool


class FrequencySummary(BaseModel):
    """O que a tela de frequência do SIGAA soma, sem as aulas."""

    model_config = ConfigDict(frozen=True)

    progress: ClassroomProgress
    frequency_status: FrequencyStatus
    # Horas-aula; `None` enquanto o docente não lança frequência.
    attended: int | None = None
    registered: int | None = None

    @classmethod
    def of(cls, frequency: ClassroomFrequency) -> Self:
        attendance = frequency.frequency
        return cls(
            progress=frequency.progress,
            frequency_status=frequency.frequency_status,
            attended=attendance.attended if attendance else None,
            registered=attendance.registered if attendance else None,
        )


class ClassroomFrequencyView(BaseModel):
    model_config = ConfigDict(frozen=True)

    progress: ClassroomProgress
    frequency_status: FrequencyStatus
    lessons: tuple[Lesson, ...]
    totals: FrequencyTotals | None

    @classmethod
    def build(
        cls,
        summary: FrequencySummary,
        rows: Iterable[tuple[models.Lesson, models.LessonAttendance | None]],
        *,
        subject_hours: int | None,
        today: date,
    ) -> Self:
        """As aulas até ontem, as publicadas pelo SIGAA e as com situação, com os totais."""
        lessons = tuple(
            sorted(
                (
                    _lesson(row, attendance)
                    for row, attendance in rows
                    if attendance or not row.scheduled or row.occurred_on < today
                ),
                key=lesson_order,
                reverse=True,
            )
        )
        return cls(
            progress=summary.progress,
            frequency_status=summary.frequency_status,
            lessons=lessons,
            totals=_totals(summary, lessons, subject_hours),
        )


@dataclass(frozen=True)
class Timetable:
    """As aulas de cada dia da semana (0 = segunda), em ordem."""

    sessions: Mapping[int, tuple[Period, ...]]

    @classmethod
    def parse(cls, schedule: str | None) -> Timetable:
        slots: dict[int, set[int]] = {}
        for days, shift, numbers in _SCHEDULE.findall(schedule or ""):
            indexes = {_ORDER.index(shift + n) for n in numbers if shift + n in _SLOTS}
            # No SIGAA, 1 é domingo e 2 é segunda.
            for day in days if indexes else ():
                slots.setdefault((int(day) - 2) % 7, set()).update(indexes)

        return cls({weekday: _runs(indexes) for weekday, indexes in slots.items()})

    def period(self, day: date, position: int) -> Period | None:
        """O horário da aula do dia; `None` fora dele, como numa reposição."""
        day_sessions = self.sessions.get(day.weekday(), ())
        return day_sessions[position] if position < len(day_sessions) else None

    def plan(self, days: Iterable[date]) -> list[tuple[date, Period]]:
        """As aulas previstas nos `days`."""
        return [
            (day, period)
            for day in days
            for period in self.sessions.get(day.weekday(), ())
        ]


def max_absences(hours: int | None) -> int | None:
    return hours // 4 if hours else None


def positioned(
    entries: Iterable[AttendanceEntry],
) -> Iterator[tuple[tuple[date, int], AttendanceEntry]]:
    """As entradas do SIGAA com a posição de cada uma entre as do mesmo dia."""
    positions: Counter[date] = Counter()
    for entry in entries:
        yield (entry.occurred_on, positions[entry.occurred_on]), entry
        positions[entry.occurred_on] += 1


def lesson_order(lesson: models.Lesson | Lesson) -> tuple[date, bool, time, str]:
    """Pelo dia e horário; as sem horário depois."""
    return (
        lesson.occurred_on,
        lesson.start_time is None,
        lesson.start_time or time.min,
        str(lesson.id),
    )


def _lesson(row: models.Lesson, attendance: models.LessonAttendance | None) -> Lesson:
    status = attendance.status if attendance else LessonStatus.NAO_REGISTRADA
    absences = attendance.absences if attendance else None
    if absences is None:
        falta = status is LessonStatus.FALTA
        absences = hours(row.start_time, row.end_time) if falta else 0
    return Lesson(
        id=row.id,
        occurred_on=row.occurred_on,
        start_time=row.start_time,
        end_time=row.end_time,
        status=status,
        absences=absences,
        marked=attendance.marked if attendance else False,
    )


def _totals(
    summary: FrequencySummary,
    lessons: Iterable[Lesson],
    subject_hours: int | None,
) -> FrequencyTotals | None:
    # `None` sem aula com presença ou falta; aula sem chamada vale presença na porcentagem.
    attended, registered = summary.attended or 0, summary.registered or 0
    presences = absences = recorded = 0
    estimated = False
    for lesson in lessons:
        if lesson.status is LessonStatus.NAO_REGISTRADA:
            registered += lesson.hours
            attended += lesson.hours
            continue
        if lesson.status is LessonStatus.CANCELADA:
            continue
        present = lesson.status is LessonStatus.PRESENTE
        presences += present
        absences += lesson.absences
        if not lesson.marked:
            recorded += 1
            continue
        estimated = True
        registered += lesson.hours
        attended += lesson.hours if present else 0

    if not estimated and not recorded:
        return None
    return FrequencyTotals(
        presences=presences,
        absences=absences,
        percentage=round(attended * 100 / registered, 1) if registered else 0,
        max_absences=max_absences(subject_hours),
        estimated=estimated,
    )


def _runs(slots: set[int]) -> tuple[Period, ...]:
    """Cada sequência de horários consecutivos, do início do primeiro ao fim do último."""
    runs: list[list[int]] = []
    for slot in sorted(slots):
        if slot - 1 in slots:
            runs[-1].append(slot)
        else:
            runs.append([slot])
    return tuple(
        Period(_SLOTS[_ORDER[run[0]]][0], _SLOTS[_ORDER[run[-1]]][1]) for run in runs
    )
