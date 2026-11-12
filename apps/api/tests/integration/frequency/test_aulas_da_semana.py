from datetime import date, datetime

from sigaa_client import AttendanceEntry, AttendanceStatus

from api.modules.classrooms.frequency import sync_frequency
from api.sync.engine import Step

from .helpers import CREDENCIAIS, FREQ, _lesson, _mark, _with_entries

LESSONS = "/lessons"


def _days(response) -> dict[str, dict]:
    return {day["date"]: day for day in response.json()}


def test_semana_traz_os_sete_dias_com_as_aulas_da_turma(logged, scheduled, hoje):
    hoje(datetime(2026, 9, 17, 15, 0))

    response = logged.get(LESSONS)

    assert response.status_code == 200
    days = _days(response)
    assert list(days) == [f"2026-09-{day}" for day in range(14, 21)]
    assert [len(day["lessons"]) for day in days.values()] == [0, 1, 0, 1, 0, 0, 0]
    lesson = days["2026-09-17"]["lessons"][0]
    assert lesson | {"id": None} == {
        "id": None,
        "start_time": "14:00:00",
        "end_time": "15:50:00",
        "status": "nao_registrada",
        "marked": False,
        "scheduled": True,
        "classroom": {
            "id": "HASH-A",
            "subject": {
                "code": "MAT0027",
                "name": "CÁLCULO 3",
                "hours": None,
                "unit": None,
            },
            "room": None,
        },
    }
    # O domingo já é da Semana Universitária.
    assert [day["no_class_reason"] for day in days.values()] == [None] * 6 + [
        "Semana Universitária 2026"
    ]


def test_situacao_marcada_aparece_na_aula_da_semana(logged, scheduled, hoje):
    hoje(datetime(2026, 9, 17, 16, 0))
    frequency = logged.get(FREQ)
    tuesday, thursday = (
        _lesson(frequency, day) for day in ("2026-09-15", "2026-09-17")
    )
    assert _mark(logged, (tuesday, "falta"), (thursday, "cancelada")).status_code == 204

    days = _days(logged.get(LESSONS))

    assert [
        (lesson["status"], lesson["marked"])
        for day in ("2026-09-15", "2026-09-17")
        for lesson in days[day]["lessons"]
    ] == [("falta", True), ("cancelada", True)]


def test_semana_universitaria_traz_o_motivo_nos_dias_sem_aula(logged, scheduled):
    days = _days(logged.get(LESSONS))

    assert all(not day["lessons"] for day in days.values())
    assert {date: day["no_class_reason"] for date, day in days.items()} == {
        "2026-09-21": "Semana Universitária 2026",
        "2026-09-22": "Semana Universitária 2026",
        "2026-09-23": "Semana Universitária 2026",
        "2026-09-24": "Semana Universitária 2026",
        "2026-09-25": "Semana Universitária 2026",
        "2026-09-26": None,
        "2026-09-27": None,
    }


def test_aulas_sem_horario_ficam_de_fora(logged, account, hoje):
    hoje(date(2026, 9, 24))
    # A turma sem horário só tem as aulas que o SIGAA publicou, sem horário.
    assert logged.get(FREQ).status_code == 200

    days = _days(logged.get(LESSONS))

    assert all(not day["lessons"] for day in days.values())


def test_responde_sem_esperar_a_frequencia_e_agenda_o_sync(
    logged, scheduled, hoje, qstash
):
    hoje(datetime(2026, 9, 17, 16, 0))
    scheduled.classrooms.get_classroom_frequency.return_value = _with_entries(
        AttendanceEntry(occurred_on=date(2026, 9, 15), status=AttendanceStatus.FALTA)
    )

    first = _days(logged.get(LESSONS))["2026-09-15"]["lessons"][0]

    assert first["status"] == "nao_registrada"
    assert [
        (job.registration, job.classroom_id, job.steps) for job in qstash.jobs()
    ] == [(CREDENCIAIS.registration, "HASH-A", (Step.of(sync_frequency),))]
    qstash.deliver(logged)
    assert _days(logged.get(LESSONS))["2026-09-15"]["lessons"][0]["status"] == "falta"


def test_frequencia_em_dia_nao_agenda_sync(logged, scheduled, hoje, qstash):
    hoje(datetime(2026, 9, 17, 15, 0))
    logged.get(FREQ)
    published = len(qstash.published)

    assert logged.get(LESSONS).status_code == 200

    assert len(qstash.published) == published
