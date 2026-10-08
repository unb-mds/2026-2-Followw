import re
from collections import Counter
from datetime import date, timedelta

from sigaa_client import AttendanceEntry, AttendanceStatus, ClassroomFrequency
from unb_browser import CalendarEventCategory, load_academic_calendar

from api import academic_calendar

_SCHEDULE = re.compile(r"([1-7]+)([MTN])([1-6]+)")
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


def _sessions_by_weekday(schedule: str | None) -> dict[int, int]:
    blocks: dict[int, list[tuple[int, int]]] = {}
    for days, shift, slots in _SCHEDULE.findall(schedule or ""):
        ranges = [
            _SLOTS[shift][int(slot) - 1]
            for slot in slots
            if int(slot) <= len(_SLOTS[shift])
        ]
        if not ranges:
            continue
        block = (ranges[0][0], ranges[-1][1])
        for day in days:
            blocks.setdefault(int(day), []).append(block)

    sessions = {}
    for day, ranges in blocks.items():
        merged = []
        for start, end in sorted(ranges):
            if merged and start <= merged[-1][1]:
                merged[-1] = (merged[-1][0], max(end, merged[-1][1]))
            else:
                merged.append((start, end))
        sessions[day] = len(merged)
    return sessions


def scheduled_entries(
    semester: str,
    schedule: str | None,
    frequency: ClassroomFrequency,
    *,
    on: date | None = None,
) -> tuple[AttendanceEntry, ...]:
    calendar = load_academic_calendar().get_semester(semester)
    sessions = _sessions_by_weekday(schedule)
    if calendar is None or not sessions:
        return ()

    cutoff = min(
        calendar.classes.end, (on or academic_calendar.today()) - timedelta(days=1)
    )
    if cutoff < calendar.classes.start:
        return ()

    no_class = {
        day
        for event in calendar.events
        if event.category in _NO_CLASS
        for day in _days(
            event.start_date, event.end_date, calendar.classes.start, cutoff
        )
    }
    official = (
        Counter(entry.occurred_on for entry in frequency.frequency.entries)
        if frequency.frequency
        else Counter()
    )
    result = []
    for day in _days(calendar.classes.start, cutoff):
        if day in no_class:
            continue
        weekday = (day.isoweekday() % 7) + 1
        for _ in range(max(0, sessions.get(weekday, 0) - official[day])):
            result.append(
                AttendanceEntry(occurred_on=day, status=AttendanceStatus.NAO_REGISTRADA)
            )
    return tuple(result)


def _days(start: date, end: date, lower: date | None = None, upper: date | None = None):
    day = max(start, lower) if lower else start
    end = min(end, upper) if upper else end
    while day <= end:
        yield day
        day += timedelta(days=1)
