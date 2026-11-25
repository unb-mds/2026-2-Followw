import re
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import time

from api.modules.classrooms.lessons import Timetable

_BLOCK = r"[1-7]+(?:M[1-5]+|T[1-6]+|N[1-4]+)"
_CODE = re.compile(rf"{_BLOCK}(?: +{_BLOCK})*")


@dataclass(frozen=True)
class ScheduleFilter:
    """Turmas só com aulas nos dias escolhidos, alguma começando num dos horários."""

    starts: frozenset[time] = frozenset()
    weekdays: frozenset[int] = frozenset()

    @classmethod
    def from_params(cls, starts: Sequence[str], days: str) -> ScheduleFilter:
        return cls(
            frozenset(map(time.fromisoformat, starts)), frozenset(map(int, days))
        )

    def matches(self, schedule: str) -> bool:
        sessions = Timetable.parse(schedule).sessions
        return bool(sessions) and (
            (not self.weekdays or sessions.keys() <= self.weekdays)
            and (
                not self.starts
                or any(
                    period.start in self.starts
                    for periods in sessions.values()
                    for period in periods
                )
            )
        )


@dataclass(frozen=True)
class ScheduleCodeSearch:
    timetable: Timetable

    def matches(self, schedule: str) -> bool:
        code = " ".join(schedule.upper().split())
        return (
            _CODE.fullmatch(code) is not None
            and Timetable.parse(code) == self.timetable
        )


type ScheduleSearch = ScheduleFilter | ScheduleCodeSearch


def parse_schedule_code(text: str) -> ScheduleCodeSearch | None:
    query = text.strip().upper()
    return (
        ScheduleCodeSearch(Timetable.parse(query)) if _CODE.fullmatch(query) else None
    )
