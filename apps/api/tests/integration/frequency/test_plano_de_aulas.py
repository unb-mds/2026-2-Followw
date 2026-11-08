from datetime import date

from sigaa_client import (
    AttendanceEntry,
    AttendanceStatus,
)
from sqlalchemy import delete, func, select

from api.academic_calendar import class_days
from api.db.models import Classroom as ClassroomRow
from api.db.models import Lesson, LessonAttendance
from api.modules.classrooms.lessons import Timetable

from .helpers import (
    CURRENT,
    FREQ,
    NO_CACHE,
    NOT_REGISTERED,
    OLD,
    SCHEDULED,
    _change_schedule,
    _lesson,
    _mark,
    _switch_to_other_student,
    _weekdays,
    _with_entries,
)


def test_aulas_previstas_vao_ate_ontem_sem_inventar_totais(logged, scheduled, database):
    data = logged.get(FREQ).json()
    assert data["frequency_status"] == "nao_registrada"
    assert data["totals"] is None
    lessons = [
        (
            lesson["occurred_on"],
            lesson["status"],
            lesson["start_time"],
            lesson["end_time"],
        )
        for lesson in data["lessons"]
    ]
    assert len(lessons) == 12
    assert lessons[0] == ("2026-09-17", "nao_registrada", "14:00:00", "15:50:00")
    assert lessons[-1] == ("2026-08-11", "nao_registrada", "14:00:00", "15:50:00")
    # O plano cobre o semestre inteiro.
    with database() as session:
        assert session.scalar(select(func.max(Lesson.occurred_on))) == date(
            2026, 12, 10
        )


def test_turma_de_semestre_passado_nao_ganha_aulas_previstas(logged, account, database):
    old = SCHEDULED.model_copy(update={"semester": "2026.1", "current": False})
    account.classrooms.list_classrooms.return_value = [old]
    lessons = logged.get(FREQ).json()["lessons"]
    assert [lesson["occurred_on"] for lesson in lessons] == [
        "2026-09-24",
        "2026-09-22",
        "2026-09-20",
    ]
    with database() as session:
        assert not any(lesson.scheduled for lesson in session.scalars(select(Lesson)))
        assert session.scalar(select(ClassroomRow.lessons_created_at)) is None


def test_turma_fora_do_calendario_tem_so_as_aulas_do_sigaa(logged, account):
    account.classrooms.list_classrooms.return_value = [
        OLD.model_copy(update={"schedule": "35T23"})
    ]
    lessons = logged.get("/classrooms/HASH-OLD/frequency").json()["lessons"]
    assert [lesson["occurred_on"] for lesson in lessons] == [
        "2026-09-24",
        "2026-09-22",
        "2026-09-20",
    ]


def test_aula_publicada_fora_do_plano_some_quando_o_sigaa_a_retira(
    logged, scheduled, database
):
    # Reposição num sábado.
    scheduled.classrooms.get_classroom_frequency.return_value = _with_entries(
        AttendanceEntry(occurred_on=date(2026, 9, 19), status=AttendanceStatus.PRESENTE)
    )
    lesson = _lesson(logged.get(FREQ), "2026-09-19")
    assert (lesson["status"], lesson["start_time"], lesson["end_time"]) == (
        "presente",
        None,
        None,
    )

    scheduled.classrooms.get_classroom_frequency.return_value = NOT_REGISTERED
    response = logged.get(FREQ, headers=NO_CACHE)
    assert "2026-09-19" not in {
        lesson["occurred_on"] for lesson in response.json()["lessons"]
    }
    with database() as session:
        assert list(session.scalars(select(LessonAttendance))) == []
        assert (
            session.scalar(
                select(Lesson).where(Lesson.occurred_on == date(2026, 9, 19))
            )
            is None
        )


def test_reposicao_no_dia_de_aula_fica_depois_dela_sem_horario(logged, scheduled):
    # A terceira entrada do dia não cabe: só há uma aula sem horário por dia.
    scheduled.classrooms.get_classroom_frequency.return_value = _with_entries(
        AttendanceEntry(
            occurred_on=date(2026, 9, 15), status=AttendanceStatus.PRESENTE
        ),
        AttendanceEntry(
            occurred_on=date(2026, 9, 15), status=AttendanceStatus.FALTA, absences=2
        ),
        AttendanceEntry(
            occurred_on=date(2026, 9, 15), status=AttendanceStatus.PRESENTE
        ),
    )
    for headers in ({}, NO_CACHE):
        response = logged.get(FREQ, headers=headers)
        assert [
            (lesson["start_time"], lesson["status"])
            for lesson in response.json()["lessons"]
            if lesson["occurred_on"] == "2026-09-15"
        ] == [(None, "falta"), ("14:00:00", "presente")]


def test_mudanca_de_horario_recria_as_aulas_sem_situacao(logged, scheduled, database):
    logged.get(FREQ)
    response = _change_schedule(logged, scheduled, "24N12")
    assert _weekdays(response) == {0, 2}
    assert _lesson(response, "2026-09-16")["start_time"] == "19:00:00"


def test_mudanca_de_horario_preserva_as_aulas_com_situacao(logged, scheduled, database):
    lesson = _lesson(logged.get(FREQ), "2026-09-15")
    assert _mark(logged, (lesson, "falta")).status_code == 204
    response = _change_schedule(logged, scheduled, "24T23")
    assert _weekdays(response) == {1, 3}
    assert _lesson(response, "2026-09-15")["marked"] is True


def test_aulas_sao_criadas_no_sync_das_turmas(logged, scheduled, database):
    assert logged.get("/classrooms").status_code == 200
    scheduled.classrooms.get_classroom_frequency.assert_not_awaited()
    with database() as session:
        classroom = session.scalar(select(ClassroomRow))
        assert classroom.lessons_created_at is not None
        lessons = session.scalars(select(Lesson)).all()
        assert len(lessons) == len(Timetable.parse("35T23").plan(class_days("2026.2")))
        assert all(lesson.scheduled for lesson in lessons)


def test_aulas_excluidas_nao_voltam(logged, scheduled, database, cookies):
    logged.get("/classrooms")
    with database() as session:
        total = session.scalar(select(func.count(Lesson.id)))
        session.execute(delete(Lesson).where(Lesson.occurred_on == date(2026, 9, 15)))
        session.commit()
    logged.get("/classrooms", headers=NO_CACHE)
    with database() as session:
        assert session.scalar(select(func.count(Lesson.id))) == total - 1
        session.execute(delete(Lesson))
        session.commit()
    _switch_to_other_student(logged, scheduled, cookies)
    logged.get("/classrooms")
    with database() as session:
        assert session.scalar(select(func.count(Lesson.id))) == 0


def test_turma_existente_sem_aulas_ganha_as_aulas_no_sync_de_outro_aluno(
    logged, account, database, cookies
):
    # Só o histórico, sem horário: a turma fica sem aulas.
    account.classrooms.list_classrooms.return_value = [CURRENT]
    logged.get("/classrooms")
    with database() as session:
        assert session.scalar(select(func.count(Lesson.id))) == 0
        assert session.scalar(select(ClassroomRow.lessons_created_at)) is None
    _switch_to_other_student(logged, account, cookies)
    account.classrooms.list_classrooms.return_value = [SCHEDULED]
    logged.get("/classrooms")
    with database() as session:
        assert session.scalar(select(func.count(Lesson.id))) > 0


def test_chamada_numa_aula_excluida_a_cria_fora_do_plano(logged, scheduled, database):
    logged.get("/classrooms")
    with database() as session:
        session.execute(delete(Lesson).where(Lesson.occurred_on == date(2026, 9, 15)))
        session.commit()
    scheduled.classrooms.get_classroom_frequency.return_value = _with_entries(
        AttendanceEntry(occurred_on=date(2026, 9, 15), status=AttendanceStatus.FALTA)
    )
    lesson = _lesson(logged.get(FREQ), "2026-09-15")
    assert (lesson["status"], lesson["start_time"]) == ("falta", "14:00:00")
    with database() as session:
        restored = session.scalar(
            select(Lesson).where(Lesson.occurred_on == date(2026, 9, 15))
        )
        assert restored.scheduled is False
