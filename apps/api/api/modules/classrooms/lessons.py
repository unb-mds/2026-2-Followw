"""As aulas da turma: o plano pelo horário e calendário e a situação do aluno em cada uma."""

import re
from collections import Counter
from collections.abc import Iterable, Iterator, Mapping
from dataclasses import dataclass
from datetime import date
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
# Os horários do dia, em ordem: horários consecutivos são uma aula só, como `M5T1`.
_SLOTS = [
    f"{shift}{slot}"
    for shift, count in (("M", 5), ("T", 6), ("N", 4))
    for slot in range(1, count + 1)
]

# Uma aula pelo dia e pela ordem entre as do mesmo dia.
type Slot = tuple[date, int]


class Lesson(BaseModel):
    """Uma aula; `position` a distingue das outras do mesmo dia."""

    model_config = ConfigDict(frozen=True)

    id: UUID
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
                key=_order,
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

    def hours(self, day: date, position: int) -> int:
        day_sessions = self.sessions.get(day.weekday(), ())
        return day_sessions[position] if position < len(day_sessions) else self.usual

    def plan(self, days: Iterable[date]) -> dict[Slot, int]:
        """As aulas previstas nos `days`, com as horas-aula de cada uma."""
        return {
            (day, position): hours
            for day in days
            for position, hours in enumerate(self.sessions.get(day.weekday(), ()))
        }


def max_absences(hours: int | None) -> int | None:
    return hours // 4 if hours else None


def positioned(
    entries: Iterable[AttendanceEntry],
) -> Iterator[tuple[Slot, AttendanceEntry]]:
    """As entradas do SIGAA com a posição de cada uma entre as do mesmo dia."""
    positions: Counter[date] = Counter()
    for entry in entries:
        yield (entry.occurred_on, positions[entry.occurred_on]), entry
        positions[entry.occurred_on] += 1


def _lesson(row: models.Lesson, attendance: models.LessonAttendance | None) -> Lesson:
    status = attendance.status if attendance else LessonStatus.NAO_REGISTRADA
    absences = attendance.absences if attendance else None
    if absences is None:
        absences = row.hours if status is LessonStatus.FALTA else 0
    return Lesson(
        id=row.id,
        occurred_on=row.occurred_on,
        position=row.position,
        status=status,
        hours=row.hours,
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
