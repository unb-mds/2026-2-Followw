import re
import unicodedata
from dataclasses import dataclass
from datetime import time

from api.modules.classrooms.lessons import Timetable

_WEEKDAYS = ("segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo")
_DAY_INDEX = {key: i for i, day in enumerate(_WEEKDAYS) for key in (day, day[:3])}
_CODE = re.compile(r"[1-7]+(?:M[1-5]+|T[1-6]+|N[1-4]+)")
_DAY = r"[a-z]+(?:-feira)?"
_DAY_SEPARATOR = r"(?:\s*,\s*(?:e\s+)?|\s+(?:e\s+)?)"
_QUERY = re.compile(
    rf"(?:(?P<days>{_DAY}(?:{_DAY_SEPARATOR}{_DAY})*)\s+)?"
    r"(?P<hour>[0-9]{1,2})(?::(?P<minute>[0-9]{2})|h)?"
)


@dataclass(frozen=True)
class StartTimeSearch:
    start: time | None
    weekdays: frozenset[int]

    def matches(self, schedule: str) -> bool:
        sessions = Timetable.parse(schedule).sessions
        starts = {
            weekday
            for weekday, periods in sessions.items()
            if self.start is None
            or any(period.start == self.start for period in periods)
        }
        if not self.weekdays:
            return bool(starts)
        return starts == self.weekdays == sessions.keys()


@dataclass(frozen=True)
class ScheduleCodeSearch:
    timetable: Timetable

    def matches(self, schedule: str) -> bool:
        return Timetable.parse(schedule.upper()) == self.timetable


type ScheduleSearch = StartTimeSearch | ScheduleCodeSearch


def parse_schedule_search(text: str) -> ScheduleSearch | None:
    normalized = unicodedata.normalize("NFKD", text.strip().lower())
    query = "".join(c for c in normalized if not unicodedata.combining(c))
    code = query.upper()
    if _CODE.fullmatch(code):
        return ScheduleCodeSearch(Timetable.parse(code))

    match = _QUERY.fullmatch(query)
    if not match:
        return None
    days = re.split(_DAY_SEPARATOR, match["days"]) if match["days"] else []
    try:
        weekdays = frozenset(_DAY_INDEX[day.removesuffix("-feira")] for day in days)
    except KeyError:
        return None
    hour, minute = int(match["hour"]), int(match["minute"] or "0")
    if hour > 23 or minute > 59:
        return None
    return StartTimeSearch(time(hour, minute), weekdays)
