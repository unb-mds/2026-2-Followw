from datetime import UTC, date, datetime, timedelta

from pydantic import SecretStr
from sigaa_client import (
    AttendanceEntry,
    AttendanceStatus,
    Classroom,
    ClassroomAttendance,
    ClassroomFrequency,
    ClassroomProgress,
    Credentials,
    Subject,
)
from sqlalchemy import update

from api.db.models import ClassroomParticipant

CREDENCIAIS = Credentials(registration="251000000", password=SecretStr("senha123"))


NO_CACHE = {"Cache-Control": "no-cache"}


FREQ = "/classrooms/HASH-A/frequency"


CURRENT = Classroom(
    id="HASH-A",
    sigaa_id=1614141,
    number="12",
    semester="2026.2",
    current=True,
    subject=Subject(code="MAT0027", name="CÁLCULO 3", hours=90),
)


# Terças e quintas, de duas horas-aula.
SCHEDULED = CURRENT.model_copy(update={"schedule": "35T23"})


SECOND = Classroom(
    id="HASH-B",
    sigaa_id=1614142,
    number="01",
    semester="2026.2",
    current=True,
    subject=Subject(code="FGA0001", name="PROGRAMAÇÃO", hours=60),
)


OLD = Classroom(
    id="HASH-OLD",
    number="01",
    semester="2025.2",
    subject=Subject(code="MAT0001", name="CÁLCULO 1", hours=90),
)


FREQUENCY = ClassroomFrequency(
    progress=ClassroomProgress(taught=30, total=90, percentage=33),
    frequency=ClassroomAttendance(
        entries=(
            AttendanceEntry(
                occurred_on=date(2026, 9, 20), status=AttendanceStatus.PRESENTE
            ),
            AttendanceEntry(
                occurred_on=date(2026, 9, 22), status=AttendanceStatus.FALTA, absences=2
            ),
            AttendanceEntry(
                occurred_on=date(2026, 9, 24), status=AttendanceStatus.NAO_REGISTRADA
            ),
        ),
        attended=28,
        registered=30,
        registered_percentage=93,
        total=90,
        total_percentage=31,
    ),
)


NOT_REGISTERED = ClassroomFrequency(progress=FREQUENCY.progress)


PROGRESS = {"taught": 30, "total": 90, "percentage": 33}


def lesson_json(occurred_on: str, status: str, absences: int = 0) -> dict:
    return {
        "occurred_on": occurred_on,
        "start_time": None,
        "end_time": None,
        "status": status,
        "absences": absences,
        "marked": False,
    }


# Turma sem horário: as aulas são só as que o SIGAA publicou, sem horário e de uma hora-aula.
FREQUENCY_JSON = {
    "progress": PROGRESS,
    "frequency_status": "parcialmente_registrada",
    "lessons": [
        lesson_json("2026-09-24", "nao_registrada"),
        lesson_json("2026-09-22", "falta", absences=2),
        lesson_json("2026-09-20", "presente"),
    ],
    "totals": {
        "presences": 1,
        "absences": 2,
        "percentage": 50.0,
        "max_absences": None,
        "estimated": False,
    },
}


NOT_REGISTERED_JSON = {
    "progress": PROGRESS,
    "frequency_status": "nao_registrada",
    "lessons": [],
    "totals": None,
}


def without_ids(frequency: dict) -> dict:
    """A frequência sem os ids das aulas, que o banco sorteia."""
    lessons = [
        {key: value for key, value in lesson.items() if key != "id"}
        for lesson in frequency["lessons"]
    ]
    return {**frequency, "lessons": lessons}


def classroom_json(classroom: Classroom) -> dict:
    data = classroom.model_dump(mode="json")
    del data["subject"]["sigaa_id"]
    return {
        **data,
        "grade": None,
        "status": "cursando",
        "professors": [],
        "vacancies": None,
        "occupied": None,
    }


def _with_entries(*entries: AttendanceEntry) -> ClassroomFrequency:
    return ClassroomFrequency(
        progress=FREQUENCY.progress,
        frequency=FREQUENCY.frequency.model_copy(update={"entries": entries}),
    )


def age_cache(database, *, days=2):
    with database() as session:
        session.execute(
            update(ClassroomParticipant)
            .where(ClassroomParticipant.frequency_synced_at.is_not(None))
            .values(frequency_synced_at=datetime.now(UTC) - timedelta(days=days))
        )
        session.commit()


def _lesson(response, occurred_on: str, start_time: str | None = None) -> dict:
    return next(
        lesson
        for lesson in response.json()["lessons"]
        if lesson["occurred_on"] == occurred_on
        and start_time in (None, lesson["start_time"])
    )


def _mark(client, *marks: tuple[dict | str, str | None], classroom: str = "HASH-A"):
    body = [
        {
            "lesson_id": lesson if isinstance(lesson, str) else lesson["id"],
            "status": status,
        }
        for lesson, status in marks
    ]
    return client.patch(f"/classrooms/{classroom}/frequency/lessons", json=body)


def _switch_to_other_student(logged, account, cookies) -> None:
    other = Credentials(registration="252000000", password=SecretStr("outra"))
    logged.cookies.clear()
    logged.cookies.update(cookies(access="other-token", refresh=other))
    account.profile.get_profile.return_value = (
        account.profile.get_profile.return_value.model_copy(
            update={"registration": other.registration}
        )
    )


def _switch_back(logged, cookies) -> None:
    logged.cookies.clear()
    logged.cookies.update(cookies(access="tok", refresh=CREDENCIAIS))


def _change_schedule(logged, account, schedule: str):
    account.classrooms.list_classrooms.return_value = [
        SCHEDULED.model_copy(update={"schedule": schedule})
    ]
    logged.get("/classrooms", headers=NO_CACHE)
    return logged.get(FREQ, headers=NO_CACHE)


def _weekdays(response) -> set[int]:
    return {
        date.fromisoformat(lesson["occurred_on"]).weekday()
        for lesson in response.json()["lessons"]
    }


def _lesson_ids(frequency: dict) -> list[str]:
    return [lesson["id"] for lesson in frequency["lessons"]]
