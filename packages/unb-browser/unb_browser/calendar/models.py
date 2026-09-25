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


class YearCalendar(BaseModel):
    model_config = ConfigDict(frozen=True)

    year: int
    resolution: str
    semesters: dict[str, SemesterCalendar]


class AcademicCalendar(BaseModel):
    model_config = ConfigDict(frozen=True)

    description: str
    source: str
    years: dict[str, YearCalendar]

    def get_year(self, year: int | str) -> YearCalendar | None:
        return self.years.get(str(year))

    def get_semester(self, semester: str) -> SemesterCalendar | None:
        year_str = semester.split(".")[0]
        year = self.get_year(year_str)
        if year is None:
            return None
        return year.semesters.get(semester)

    def list_semesters(self) -> tuple[SemesterCalendar, ...]:
        semesters: list[SemesterCalendar] = []
        for year in self.years.values():
            semesters.extend(year.semesters.values())
        return tuple(semesters)
