from datetime import date, datetime, time
from uuid import uuid4

import pytest
from sigaa_client import (
    AttendanceEntry,
    AttendanceStatus,
    ClassroomAttendance,
    ClassroomFrequency,
    ClassroomProgress,
)
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateTable

from api.academic_calendar import class_days
from api.db.enums import LessonStatus
from api.db.models import Lesson, LessonAttendance
from api.modules.classrooms.lessons import (
    ClassroomFrequencyView,
    FrequencySummary,
    FrequencyTotals,
    Period,
    Timetable,
    hours,
    max_absences,
    positioned,
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

# Aulas da tarde pelas horas-aula.
_ENDS = {1: time(14, 55), 2: time(15, 50), 3: time(16, 55)}


def _row(
    day: date,
    status: LessonStatus | None = None,
    *,
    marked: bool = False,
    absences: int | None = None,
    hours: int = 2,
    scheduled: bool = True,
) -> tuple[Lesson, LessonAttendance | None]:
    lesson = Lesson(
        id=uuid4(),
        occurred_on=day,
        start_time=time(14),
        end_time=_ENDS[hours],
        scheduled=scheduled,
    )
    if status is None:
        return lesson, None
    return lesson, LessonAttendance(status=status, marked=marked, absences=absences)


def _sigaa_rows() -> list[tuple[Lesson, LessonAttendance | None]]:
    """As aulas com chamada em FREQUENCY, de duas horas-aula."""
    return [
        _row(date(2026, 9, 20), LessonStatus.PRESENTE, absences=0),
        _row(date(2026, 9, 22), LessonStatus.FALTA, absences=2),
    ]


def _view(
    rows,
    summary: ClassroomFrequency = FREQUENCY,
    now: datetime = datetime(2026, 10, 1),
    workload: int | None = 60,
) -> ClassroomFrequencyView:
    return ClassroomFrequencyView.build(
        FrequencySummary.of(summary), rows, now=now, workload=workload
    )


def _hours(schedule: str) -> dict[int, tuple[int, ...]]:
    sessions = Timetable.parse(schedule).sessions
    return {
        day: tuple(hours(period.start, period.end) for period in day_sessions)
        for day, day_sessions in sessions.items()
    }


def test_horario_vira_aulas_por_dia_com_inicio_e_fim():
    assert Timetable.parse("35T23").sessions == {
        1: (Period(time(14), time(15, 50)),),
        3: (Period(time(14), time(15, 50)),),
    }
    # Horários consecutivos são uma aula só, mesmo entre turnos ou blocos; separados, duas.
    assert Timetable.parse("35M5 35T1").sessions[1] == (Period(time(12), time(13, 50)),)
    assert _hours("3M12 3M34") == {1: (4,)}
    assert Timetable.parse("3M12 3T45").sessions[1] == (
        Period(time(8), time(9, 50)),
        Period(time(16), time(17, 50)),
    )
    assert _hours("6M1234 6M12") == {4: (4,)}
    assert Timetable.parse(None).sessions == {}
    assert Timetable.parse("99Z9 2N6").sessions == {}


def test_horas_aula_pelo_inicio_e_fim():
    assert hours(time(8), time(9, 50)) == 2
    assert hours(time(19), time(22, 30)) == 4
    assert hours(None, None) == 1


def test_aula_fora_do_horario_fica_sem_horario():
    timetable = Timetable.parse("2M12 4M123 6M123")
    assert timetable.period(date(2026, 8, 10), 0) == Period(time(8), time(9, 50))
    assert timetable.period(date(2026, 8, 10), 1) is None
    assert timetable.period(date(2026, 8, 15), 0) is None
    assert Timetable.parse(None).period(date(2026, 8, 10), 0) is None


def test_banco_aceita_uma_so_aula_sem_horario_por_dia():
    ddl = str(CreateTable(Lesson.__table__).compile(dialect=postgresql.dialect()))
    assert "NULLS NOT DISTINCT (classroom_id, occurred_on, start_time)" in ddl


def test_plano_cobre_o_semestre_pelo_horario_sem_feriados():
    plan = Timetable.parse("35M5 35T1").plan(class_days("2026.2"))
    assert plan[0] == (date(2026, 8, 11), Period(time(12), time(13, 50)))
    assert date(2026, 9, 22) not in {day for day, _ in plan}
    assert {day.weekday() for day, _ in plan} == {1, 3}
    assert plan[-1][0] == date(2026, 12, 10)
    assert Timetable.parse("3M12 3T45").plan([date(2026, 8, 11)]) == [
        (date(2026, 8, 11), Period(time(8), time(9, 50))),
        (date(2026, 8, 11), Period(time(16), time(17, 50))),
    ]
    assert Timetable.parse(None).plan(class_days("2026.2")) == []


def test_entradas_do_mesmo_dia_ganham_posicoes_em_ordem():
    entries = [
        AttendanceEntry(occurred_on=date(2026, 9, 15), status=AttendanceStatus.FALTA),
        AttendanceEntry(
            occurred_on=date(2026, 9, 15), status=AttendanceStatus.PRESENTE
        ),
        AttendanceEntry(occurred_on=date(2026, 9, 17), status=AttendanceStatus.FALTA),
    ]
    assert [slot for slot, _ in positioned(entries)] == [
        (date(2026, 9, 15), 0),
        (date(2026, 9, 15), 1),
        (date(2026, 9, 17), 0),
    ]


def test_mostra_previstas_ja_comecadas_e_sempre_as_publicadas_ou_com_situacao():
    rows = [
        _row(date(2026, 9, 21)),
        _row(date(2026, 9, 22)),
        _row(date(2026, 9, 24), scheduled=False),
        _row(date(2026, 9, 23), LessonStatus.CANCELADA, marked=True),
    ]
    view = _view(rows, NOT_REGISTERED, now=datetime(2026, 9, 22, 13, 59))
    assert [(lesson.occurred_on, lesson.status) for lesson in view.lessons] == [
        (date(2026, 9, 24), LessonStatus.NAO_REGISTRADA),
        (date(2026, 9, 23), LessonStatus.CANCELADA),
        (date(2026, 9, 21), LessonStatus.NAO_REGISTRADA),
    ]


def test_aula_de_hoje_aparece_assim_que_comeca():
    rows = [_row(date(2026, 9, 21)), _row(date(2026, 9, 22))]
    view = _view(rows, NOT_REGISTERED, now=datetime(2026, 9, 22, 14))
    assert [lesson.occurred_on for lesson in view.lessons] == [
        date(2026, 9, 22),
        date(2026, 9, 21),
    ]


def test_falta_marcada_conta_a_aula_toda_e_a_do_sigaa_suas_horas():
    rows = [
        *_sigaa_rows(),
        _row(date(2026, 9, 24)),
        _row(date(2026, 9, 25), LessonStatus.FALTA, marked=True, hours=3),
    ]
    assert [
        (lesson.occurred_on, lesson.status, lesson.absences, lesson.marked)
        for lesson in _view(rows).lessons
    ] == [
        (date(2026, 9, 25), LessonStatus.FALTA, 3, True),
        (date(2026, 9, 24), LessonStatus.NAO_REGISTRADA, 0, False),
        (date(2026, 9, 22), LessonStatus.FALTA, 2, False),
        (date(2026, 9, 20), LessonStatus.PRESENTE, 0, False),
    ]


def test_totais_contam_aulas_com_marcacoes():
    marks = [
        _row(date(2026, 9, 24), LessonStatus.FALTA, marked=True),
        _row(date(2026, 9, 25), LessonStatus.PRESENTE, marked=True),
        _row(date(2026, 9, 28), LessonStatus.CANCELADA, marked=True),
        _row(date(2026, 9, 29)),
    ]
    # 12 horas-aula, 4 de falta: 8 / 12.
    assert _view([*_sigaa_rows(), *marks]).totals == FrequencyTotals(
        presences=4, absences=4, percentage=66.7, max_absences=15, estimated=True
    )


@pytest.mark.parametrize(
    "workload,expected", [(60, 15), (90, 22), (30, 7), (None, None)]
)
def test_maximo_de_faltas_e_um_quarto_da_carga_horaria(workload, expected):
    assert max_absences(workload) == expected


def test_totais_contam_horas_aula_de_cada_dia():
    rows = [
        _row(date(2026, 9, d), LessonStatus.PRESENTE, absences=0) for d in range(1, 20)
    ]
    rows.append(_row(date(2026, 9, 21), LessonStatus.FALTA, absences=2))
    rows.append(_row(date(2026, 9, 22), LessonStatus.FALTA, absences=2))
    assert _view(rows).totals == FrequencyTotals(
        presences=38, absences=4, percentage=90.5, max_absences=15, estimated=False
    )


def test_turma_sem_carga_horaria_nao_tem_maximo_de_faltas():
    assert _view(_sigaa_rows(), workload=None).totals.max_absences is None


def test_turma_sem_horario_nao_tem_maximo_de_faltas():
    rows = [_row(date(2026, 9, 20), LessonStatus.PRESENTE, scheduled=False)]
    assert _view(rows).totals.max_absences is None


def test_aula_sem_chamada_ou_cancelada_conta_como_presenca_so_na_porcentagem():
    totals = _view([*_sigaa_rows(), _row(date(2026, 9, 24))]).totals
    assert (totals.presences, totals.absences, totals.percentage) == (2, 2, 66.7)
    cancelada = _row(date(2026, 9, 24), LessonStatus.CANCELADA, marked=True)
    assert _view([*_sigaa_rows(), cancelada]).totals == totals


def test_falta_parcial_do_sigaa_conta_so_as_horas_de_falta():
    rows = [
        _row(date(2026, 9, 20), LessonStatus.PRESENTE, absences=0),
        _row(date(2026, 9, 22), LessonStatus.FALTA, absences=1, hours=3),
    ]
    totals = _view(rows).totals
    assert (totals.presences, totals.absences, totals.percentage) == (4, 1, 80)


def test_totais_sem_chamada_do_sigaa_vem_so_das_marcacoes():
    marks = [
        _row(date(2026, 9, 24), LessonStatus.PRESENTE, marked=True),
        _row(date(2026, 9, 25), LessonStatus.FALTA, marked=True),
    ]
    assert _view(marks, NOT_REGISTERED).totals == FrequencyTotals(
        presences=2, absences=2, percentage=50, max_absences=15, estimated=True
    )
    cancelada = _row(date(2026, 9, 24), LessonStatus.CANCELADA, marked=True)
    assert _view([cancelada], NOT_REGISTERED).totals is None
