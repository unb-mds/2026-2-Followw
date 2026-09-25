from datetime import date

from unb_browser import (
    AcademicCalendar,
    Calendar,
    CalendarEventCategory,
    UnbBrowser,
    load_academic_calendar,
)


def test_load_academic_calendar() -> None:
    cal = load_academic_calendar()
    assert isinstance(cal, AcademicCalendar)
    assert "2026" in cal.years
    assert "2027" in cal.years


def test_calendar_resource_semesters() -> None:
    cal = Calendar()
    sem_2026_1 = cal.get_semester("2026.1")
    assert sem_2026_1 is not None
    assert sem_2026_1.semester == "2026.1"
    assert sem_2026_1.period.start == date(2026, 2, 23)
    assert sem_2026_1.period.end == date(2026, 7, 23)
    assert sem_2026_1.classes.start == date(2026, 3, 16)
    assert sem_2026_1.classes.end == date(2026, 7, 18)
    assert sem_2026_1.classes.instructional_days == 100

    # Verifica se os eventos acadêmicos foram adicionados
    assert len(sem_2026_1.events) > 0
    enrollment_events = [
        e for e in sem_2026_1.events if e.category == CalendarEventCategory.ENROLLMENT
    ]
    assert len(enrollment_events) > 0


def test_calendar_resource_2027() -> None:
    cal = Calendar()
    year_2027 = cal.get_year(2027)
    assert year_2027 is not None
    assert "2027.1" in year_2027.semesters
    assert "2027.2" in year_2027.semesters
    assert "2027.4" in year_2027.semesters

    sem_2027_1 = cal.get_semester("2027.1")
    assert sem_2027_1 is not None
    assert sem_2027_1.classes.start == date(2027, 3, 15)
    assert sem_2027_1.classes.end == date(2027, 7, 16)

    sem_2027_2 = cal.get_semester("2027.2")
    assert sem_2027_2 is not None
    assert sem_2027_2.classes.instructional_days == 107


def test_calendar_non_existent_semester() -> None:
    cal = Calendar()
    assert cal.get_semester("9999.1") is None
    assert cal.get_year(9999) is None


def test_calendar_list_semesters() -> None:
    cal = Calendar()
    semesters = cal.list_semesters()
    sem_ids = [s.semester for s in semesters]
    assert "2026.1" in sem_ids
    assert "2026.2" in sem_ids
    assert "2026.4" in sem_ids
    assert "2027.1" in sem_ids
    assert "2027.2" in sem_ids
    assert "2027.4" in sem_ids


async def test_unb_browser_calendar_attribute() -> None:
    async with UnbBrowser() as browser:
        assert isinstance(browser.calendar, Calendar)
        sem = browser.calendar.get_semester("2026.1")
        assert sem is not None
        assert sem.semester == "2026.1"
