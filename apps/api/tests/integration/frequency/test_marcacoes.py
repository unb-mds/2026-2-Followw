from datetime import date, datetime
from uuid import uuid4

from sigaa_client import (
    AttendanceEntry,
    AttendanceStatus,
)
from sqlalchemy import select

from api.db.enums import LessonStatus
from api.db.models import Lesson, LessonAttendance

from .helpers import (
    CURRENT,
    FREQ,
    NO_CACHE,
    SCHEDULED,
    SECOND,
    _lesson,
    _mark,
    _switch_back,
    _switch_to_other_student,
    _with_entries,
)


def test_marcacao_persiste_muda_de_status_e_pode_ser_removida(
    logged, scheduled, database
):
    marked = _lesson(logged.get(FREQ), "2026-09-17")
    for status in ("falta", "presente", "cancelada"):
        assert _mark(logged, (marked, status)).status_code == 204
        lesson = _lesson(logged.get(FREQ), "2026-09-17")
        assert (lesson["status"], lesson["marked"]) == (status, True)
    with database() as session:
        assert [
            (attendance.status, attendance.marked, attendance.absences)
            for attendance in session.scalars(select(LessonAttendance))
        ] == [(LessonStatus.CANCELADA, True, None)]
    assert _mark(logged, (marked, None)).status_code == 204
    lesson = _lesson(logged.get(FREQ), "2026-09-17")
    assert (lesson["status"], lesson["marked"]) == ("nao_registrada", False)
    assert _mark(logged, (marked, None)).status_code == 204


def test_marca_varias_aulas_de_uma_vez_ou_nenhuma(logged, scheduled, database):
    response = logged.get(FREQ)
    first, second = (_lesson(response, day) for day in ("2026-09-15", "2026-09-17"))
    assert _mark(logged, (first, "presente"), (second, "falta")).status_code == 204
    response = logged.get(FREQ)
    assert [
        _lesson(response, day)["status"] for day in ("2026-09-15", "2026-09-17")
    ] == [
        "presente",
        "falta",
    ]

    assert _mark(logged, (first, None), (str(uuid4()), "falta")).status_code == 404
    assert _lesson(logged.get(FREQ), "2026-09-15")["status"] == "presente"

    assert _mark(logged, (first, None), (second, "cancelada")).status_code == 204
    response = logged.get(FREQ)
    assert [
        (_lesson(response, day)["status"], _lesson(response, day)["marked"])
        for day in ("2026-09-15", "2026-09-17")
    ] == [("nao_registrada", False), ("cancelada", True)]


def test_marcacao_entra_nos_totais_da_frequencia(logged, account, depois_da_aula):
    lesson = _lesson(logged.get(FREQ), "2026-09-24")
    assert _mark(logged, (lesson, "falta")).status_code == 204
    assert logged.get(FREQ).json()["totals"] == {
        "presences": 1,
        "absences": 3,
        "percentage": 25.0,
        "max_absences": None,
        "estimated": True,
    }


def test_chamada_do_sigaa_substitui_a_marcacao(logged, scheduled):
    marked = _lesson(logged.get(FREQ), "2026-09-15")
    assert _mark(logged, (marked, "presente")).status_code == 204

    scheduled.classrooms.get_classroom_frequency.return_value = _with_entries(
        AttendanceEntry(
            occurred_on=date(2026, 9, 15), status=AttendanceStatus.FALTA, absences=2
        )
    )
    lesson = _lesson(logged.get(FREQ, headers=NO_CACHE), "2026-09-15")
    assert (lesson["status"], lesson["absences"], lesson["marked"]) == (
        "falta",
        2,
        False,
    )
    assert _mark(logged, (marked, "presente")).status_code == 409
    assert _mark(logged, (marked, None)).status_code == 204
    assert _lesson(logged.get(FREQ), "2026-09-15")["status"] == "falta"


def test_chamada_de_uma_das_aulas_no_mesmo_dia_preserva_a_outra(logged, scheduled):
    scheduled.classrooms.list_classrooms.return_value = [
        CURRENT.model_copy(update={"schedule": "3M12 3T45"})
    ]
    response = logged.get(FREQ)
    marks = [
        (_lesson(response, "2026-09-15", start_time), "falta")
        for start_time in ("08:00:00", "16:00:00")
    ]
    assert _mark(logged, *marks).status_code == 204

    scheduled.classrooms.get_classroom_frequency.return_value = _with_entries(
        AttendanceEntry(
            occurred_on=date(2026, 9, 15), status=AttendanceStatus.NAO_REGISTRADA
        ),
        AttendanceEntry(
            occurred_on=date(2026, 9, 15), status=AttendanceStatus.PRESENTE
        ),
    )
    response = logged.get(FREQ, headers=NO_CACHE)
    assert [
        (lesson["start_time"], lesson["status"], lesson["marked"])
        for lesson in response.json()["lessons"]
        if lesson["occurred_on"] == "2026-09-15"
    ] == [("16:00:00", "presente", False), ("08:00:00", "falta", True)]


def test_refresh_preserva_marcacao(logged, scheduled):
    lesson = _lesson(logged.get(FREQ), "2026-09-17")
    assert _mark(logged, (lesson, "falta")).status_code == 204
    response = logged.get(FREQ, headers=NO_CACHE)
    assert _lesson(response, "2026-09-17")["marked"] is True


def test_marcacao_exige_login_aula_e_turma_do_aluno(client, logged, scheduled):
    scheduled.classrooms.list_classrooms.return_value = [
        SCHEDULED,
        SECOND.model_copy(update={"schedule": "35T23"}),
    ]
    lesson = _lesson(logged.get(FREQ), "2026-09-17")
    other = _lesson(logged.get("/classrooms/HASH-B/frequency"), "2026-09-17")
    assert _mark(logged, (lesson, "falta")).status_code == 204
    for target, classroom in (
        (lesson, "UNKNOWN"),
        (other, "HASH-A"),
        (str(uuid4()), "HASH-A"),
    ):
        for status in ("falta", None):
            response = _mark(logged, (target, status), classroom=classroom)
            assert response.status_code == 404
    logged.cookies.clear()
    assert _mark(client, (lesson, "falta")).status_code == 401
    assert _mark(client, (lesson, None)).status_code == 401


def test_marcacoes_nao_sao_compartilhadas_entre_alunos(logged, scheduled, cookies):
    lesson = _lesson(logged.get(FREQ), "2026-09-17")
    assert _mark(logged, (lesson, "falta")).status_code == 204
    _switch_to_other_student(logged, scheduled, cookies)
    response = logged.get(FREQ)
    assert not any(lesson["marked"] for lesson in response.json()["lessons"])
    _switch_back(logged, cookies)
    assert _lesson(logged.get(FREQ), "2026-09-17")["marked"] is True


def test_marcacao_valida_dados(logged, scheduled):
    lesson = _lesson(logged.get(FREQ), "2026-09-17")
    assert _mark(logged, (lesson, "nao_registrada")).status_code == 422
    assert _mark(logged, ("ontem", "falta")).status_code == 422
    assert _mark(logged, ("ontem", None)).status_code == 422
    assert _mark(logged, (lesson, "falta"), (lesson, None)).status_code == 422
    for body in ({"status": "falta"}, [{"lesson_id": lesson["id"]}]):
        assert logged.patch(f"{FREQ}/lessons", json=body).status_code == 422


def test_marcacao_de_aula_que_ainda_nao_aconteceu_e_recusada(
    logged, scheduled, database
):
    logged.get(FREQ)
    with database() as session:
        future = session.scalar(
            select(Lesson).where(Lesson.occurred_on == date(2026, 10, 1))
        )
    assert _mark(logged, (str(future.id), "falta")).status_code == 422
    with database() as session:
        assert list(session.scalars(select(LessonAttendance))) == []


def test_aula_de_hoje_pode_ser_marcada_assim_que_comeca(
    logged, scheduled, database, hoje
):
    logged.get(FREQ)
    with database() as session:
        lesson = str(
            session.scalar(
                select(Lesson.id).where(Lesson.occurred_on == date(2026, 9, 29))
            )
        )
    hoje(datetime(2026, 9, 29, 13, 59))
    assert _mark(logged, (lesson, "presente")).status_code == 422
    hoje(datetime(2026, 9, 29, 14))
    assert _lesson(logged.get(FREQ), "2026-09-29")["id"] == lesson
    assert _mark(logged, (lesson, "presente")).status_code == 204
