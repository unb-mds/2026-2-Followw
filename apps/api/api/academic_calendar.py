"""Regras que dependem do calendário acadêmico da UnB (`unb_browser`)."""

import enum
from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from unb_browser import CalendarEventCategory, load_academic_calendar

from api.db.enums import ClassroomStatus

_BRASILIA = ZoneInfo("America/Sao_Paulo")
# Dá tempo de o último sync da turma marcar os alunos como concluídos.
MEMBERS_TOLERANCE = timedelta(days=3)
# Docente que consolida a turma com atraso ainda tem a menção lida.
GRADES_TOLERANCE = timedelta(days=3)
_NO_CLASS = {
    CalendarEventCategory.HOLIDAY,
    CalendarEventCategory.OPTIONAL_HOLIDAY,
    CalendarEventCategory.UNIVERSITY_WEEK,
}


class Event(str, enum.Enum):
    """Os ids dos eventos do calendário que as regras usam."""

    EXTRAORDINARY_ENROLLMENT = "extraordinary_enrollment"
    GRADES_CONSOLIDATION = "grades_consolidation"
    SEMESTER_END = "semester_end"


def today() -> date:
    return datetime.now(_BRASILIA).date()


def ended(
    semester: str,
    event: Event,
    tolerance: timedelta = timedelta(),
    on: date | None = None,
) -> bool:
    calendar = load_academic_calendar()
    semester_calendar = calendar.get_semester(semester)
    if semester_calendar is None:
        # Fora do calendário: o semestre anterior a ele já acabou, o posterior não.
        return semester < min(calendar.semesters)
    end = next((e.end_date for e in semester_calendar.events if e.id == event), None)
    return end is not None and (on or today()) > end + tolerance


def local_date(at: datetime) -> date:
    # O SQLite devolve as datas sem fuso, em UTC.
    if at.tzinfo is None:
        at = at.replace(tzinfo=UTC)
    return at.astimezone(_BRASILIA).date()


def members_closed(semester: str) -> bool:
    """A tolerância do fim do semestre já passou: falta só o último sync dos participantes."""
    return ended(semester, Event.SEMESTER_END, MEMBERS_TOLERANCE)


def members_frozen(semester: str, synced_at: datetime) -> bool:
    """Os participantes sincronizados depois da tolerância não são ressincronizados."""
    return ended(semester, Event.SEMESTER_END, MEMBERS_TOLERANCE, local_date(synced_at))


def grades_closed(semester: str) -> bool:
    """A tolerância da consolidação já passou: falta só o último sync da menção."""
    return ended(semester, Event.GRADES_CONSOLIDATION, GRADES_TOLERANCE)


def grades_frozen(semester: str, synced_at: datetime) -> bool:
    """A menção sincronizada depois da consolidação das turmas não muda mais."""
    return ended(
        semester, Event.GRADES_CONSOLIDATION, GRADES_TOLERANCE, local_date(synced_at)
    )


def member_status(semester: str) -> ClassroomStatus:
    if ended(semester, Event.SEMESTER_END):
        return ClassroomStatus.CONCLUIDO
    return ClassroomStatus.CURSANDO


def departure_status(semester: str) -> ClassroomStatus:
    if ended(semester, Event.EXTRAORDINARY_ENROLLMENT):
        return ClassroomStatus.TRANCADO
    return ClassroomStatus.REMOVIDO


def class_days(semester: str, *, on: date | None = None) -> Iterator[date]:
    """Os dias letivos do semestre até ontem, sem feriados e semana universitária."""
    calendar = load_academic_calendar().get_semester(semester)
    if calendar is None:
        return
    start = calendar.classes.start
    end = min(calendar.classes.end, (on or today()) - timedelta(days=1))
    no_class = {
        day
        for event in calendar.events
        if event.category in _NO_CLASS
        for day in _days(max(event.start_date, start), min(event.end_date, end))
    }
    for day in _days(start, end):
        if day not in no_class:
            yield day


def _days(start: date, end: date) -> Iterator[date]:
    day = start
    while day <= end:
        yield day
        day += timedelta(days=1)
