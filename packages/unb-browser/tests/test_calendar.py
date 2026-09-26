from datetime import date

from unb_browser import (
    Calendar,
    CalendarEventCategory,
    UnbBrowser,
)


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

    event_ids = {e.id for e in sem_2026_1.events}
    assert "regular_enrollment" in event_ids
    assert "enrollment_processing" in event_ids
    assert "enrollment_results" in event_ids
    assert "re_enrollment_period" in event_ids
    assert "re_enrollment_processing" in event_ids
    assert "re_enrollment_results" in event_ids
    assert "extraordinary_enrollment" in event_ids
    assert "registration_partial_suspend" in event_ids
    assert "registration_general_suspend" in event_ids
    assert "quarter_semester" in event_ids

    enrollment_events = [
        e for e in sem_2026_1.events if e.category == CalendarEventCategory.ENROLLMENT
    ]
    assert len(enrollment_events) > 0


def test_calendar_enrollment_cycle_all_semesters() -> None:
    cal = Calendar()
    expected_regular_cycle = {
        "regular_enrollment",
        "enrollment_processing",
        "enrollment_results",
        "re_enrollment_period",
        "re_enrollment_processing",
        "re_enrollment_results",
        "extraordinary_enrollment",
        "registration_partial_suspend",
        "registration_general_suspend",
        "classes_start",
        "classes_end",
        "grades_consolidation",
        "semester_end",
        "student_dismissal_processing",
    }
    for sem_id in ["2026.1", "2026.2", "2027.1", "2027.2"]:
        sem = cal.get_semester(sem_id)
        assert sem is not None, f"Semestre {sem_id} não encontrado"
        event_ids = {e.id for e in sem.events}
        missing = expected_regular_cycle - event_ids
        assert not missing, f"Semestre {sem_id} está sem as etapas: {missing}"

    expected_summer_cycle = {
        "regular_enrollment",
        "enrollment_processing",
        "enrollment_results",
        "extraordinary_enrollment",
        "registration_partial_suspend",
        "registration_general_suspend",
        "classes_start",
        "classes_end",
        "grades_consolidation",
        "semester_end",
    }
    for sem_id in ["2026.4", "2027.4"]:
        sem = cal.get_semester(sem_id)
        assert sem is not None, f"Semestre de verão {sem_id} não encontrado"
        event_ids = {e.id for e in sem.events}
        missing = expected_summer_cycle - event_ids
        assert not missing, f"Semestre de verão {sem_id} está sem as etapas: {missing}"


def test_calendar_resource_2027() -> None:
    cal = Calendar()
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
