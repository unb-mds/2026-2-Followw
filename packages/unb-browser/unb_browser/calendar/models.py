from datetime import date
from enum import StrEnum

from pydantic import BaseModel, ConfigDict


class CalendarEventCategory(StrEnum):
    ACADEMIC = "academic"
    ADMINISTRATIVE = "administrative"
    ENROLLMENT = "enrollment"
    HOLIDAY = "holiday"
    OPTIONAL_HOLIDAY = "optional_holiday"
    UNIVERSITY_WEEK = "university_week"
    OTHER = "other"


class CalendarPeriod(BaseModel):
    model_config = ConfigDict(frozen=True)

    start: date
    end: date


class ClassesPeriod(CalendarPeriod):
    instructional_days: int


class CalendarEvent(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: str | None = None
    name: str
    start_date: date
    end_date: date
    category: CalendarEventCategory


class SemesterCalendar(BaseModel):
    model_config = ConfigDict(frozen=True)

    semester: str
    name: str
    period: CalendarPeriod
    classes: ClassesPeriod
    events: tuple[CalendarEvent, ...] = ()


class AcademicCalendar(BaseModel):
    model_config = ConfigDict(frozen=True)

    semesters: dict[str, SemesterCalendar]

    def get_semester(self, semester: str) -> SemesterCalendar | None:
        return self.semesters.get(semester)

    def list_semesters(self) -> tuple[SemesterCalendar, ...]:
        return tuple(self.semesters.values())
