from datetime import UTC, date, datetime, time, timedelta
from unittest.mock import AsyncMock, call
from uuid import uuid4

import pytest
from pydantic import SecretStr
from sigaa_client import (
    AttendanceEntry,
    AttendanceStatus,
    Classroom,
    ClassroomAttendance,
    ClassroomFrequency,
    ClassroomNotFound,
    ClassroomProgress,
    Credentials,
    FrequencyStatus,
    SessionExpired,
    SigaaParseError,
    Subject,
)
from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateTable

from api.academic_calendar import class_days
from api.db.enums import ClassroomStatus, LessonStatus
from api.db.models import Classroom as ClassroomRow
from api.db.models import ClassroomParticipant, Lesson, LessonAttendance
from api.modules.classrooms.frequency import sync_frequency
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
from api.sync.engine import Step

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
        "percentage": 93.5,
        "max_absences": 22,
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
    return {**data, "grade": None}


def _with_entries(*entries: AttendanceEntry) -> ClassroomFrequency:
    return ClassroomFrequency(
        progress=FREQUENCY.progress,
        frequency=FREQUENCY.frequency.model_copy(update={"entries": entries}),
    )


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
    rows, summary: ClassroomFrequency = FREQUENCY, today: date = date(2026, 10, 1)
) -> ClassroomFrequencyView:
    return ClassroomFrequencyView.build(
        FrequencySummary.of(summary), rows, subject_hours=90, today=today
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


def test_mostra_previstas_ate_ontem_e_sempre_as_publicadas_ou_com_situacao():
    rows = [
        _row(date(2026, 9, 21)),
        _row(date(2026, 9, 22)),
        _row(date(2026, 9, 24), scheduled=False),
        _row(date(2026, 9, 23), LessonStatus.CANCELADA, marked=True),
    ]
    view = _view(rows, NOT_REGISTERED, today=date(2026, 9, 22))
    assert [(lesson.occurred_on, lesson.status) for lesson in view.lessons] == [
        (date(2026, 9, 24), LessonStatus.NAO_REGISTRADA),
        (date(2026, 9, 23), LessonStatus.CANCELADA),
        (date(2026, 9, 21), LessonStatus.NAO_REGISTRADA),
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


def test_totais_somam_marcacoes_em_horas_aula_e_ignoram_canceladas():
    marks = [
        _row(date(2026, 9, 24), LessonStatus.FALTA, marked=True),
        _row(date(2026, 9, 25), LessonStatus.PRESENTE, marked=True),
        _row(date(2026, 9, 28), LessonStatus.CANCELADA, marked=True),
    ]
    assert _view([*_sigaa_rows(), *marks]).totals == FrequencyTotals(
        presences=2, absences=4, percentage=88.2, max_absences=22, estimated=True
    )
    assert _view([*_sigaa_rows(), _row(date(2026, 9, 24))]).totals == FrequencyTotals(
        presences=1, absences=2, percentage=93.8, max_absences=22, estimated=False
    )


@pytest.mark.parametrize(
    "hours,expected",
    [(30, 7), (60, 15), (90, 22), (15, 3), (7, 1), (0, None), (None, None)],
)
def test_maximo_de_faltas_pela_carga_horaria(hours, expected):
    assert max_absences(hours) == expected


def test_aula_sem_chamada_conta_como_presenca_so_na_porcentagem():
    # 28 de 30 horas-aula do SIGAA + a aula de 24/09 (2h) sem chamada.
    totals = _view([*_sigaa_rows(), _row(date(2026, 9, 24))]).totals
    assert (totals.presences, totals.absences, totals.percentage) == (1, 2, 93.8)
    # Cancelada fica de fora: a porcentagem volta à do SIGAA.
    cancelada = _row(date(2026, 9, 24), LessonStatus.CANCELADA, marked=True)
    assert _view([*_sigaa_rows(), cancelada]).totals.percentage == 93.3


def test_totais_sem_chamada_do_sigaa_vem_so_das_marcacoes():
    marks = [
        _row(date(2026, 9, 24), LessonStatus.PRESENTE, marked=True),
        _row(date(2026, 9, 25), LessonStatus.FALTA, marked=True),
    ]
    assert _view(marks, NOT_REGISTERED).totals == FrequencyTotals(
        presences=1, absences=2, percentage=50, max_absences=22, estimated=True
    )
    cancelada = _row(date(2026, 9, 24), LessonStatus.CANCELADA, marked=True)
    assert _view([cancelada], NOT_REGISTERED).totals is None


@pytest.fixture
def account(stub_sigaa):
    stub_sigaa.classrooms.list_classrooms.return_value = [SECOND, OLD, CURRENT]
    stub_sigaa.classrooms.get_classroom_frequency = AsyncMock(return_value=FREQUENCY)
    return stub_sigaa


@pytest.fixture
def scheduled(account):
    """Só a turma atual, com horário e sem chamada no SIGAA."""
    account.classrooms.list_classrooms.return_value = [SCHEDULED]
    account.classrooms.get_classroom_frequency.return_value = NOT_REGISTERED
    return account


@pytest.fixture
def logged(client, cookies):
    client.cookies.update(cookies(access="tok", refresh=CREDENCIAIS))
    return client


@pytest.fixture
def depois_da_aula(hoje):
    hoje(date(2026, 9, 25))


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


def _mark(lesson: dict, classroom: str = "HASH-A") -> str:
    return f"/classrooms/{classroom}/frequency/lessons/{lesson['id']}"


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


def test_ids_numerico_e_hash_retornam_todos_os_campos_e_usam_o_mesmo_cache(
    logged, account, database, qstash
):
    responses = [
        logged.get(f"/classrooms/{identifier}/frequency")
        for identifier in ("1614141", "HASH-A", "1614141")
    ]
    for response in responses:
        assert response.status_code == 200
        assert without_ids(response.json()) == FREQUENCY_JSON
        assert response.headers["cache-control"] == "private, no-cache"
    assert len({str(response.json()) for response in responses}) == 1
    account.classrooms.get_classroom_frequency.assert_awaited_once_with("HASH-A")
    assert qstash.published == []
    with database() as session:
        link = session.scalar(
            select(ClassroomParticipant).where(
                ClassroomParticipant.frequency_synced_at.is_not(None)
            )
        )
        assert (
            link.frequency_status,
            link.progress_taught,
            link.attended_hours,
            link.registered_hours,
        ) == (FrequencyStatus.PARCIALMENTE_REGISTRADA, 30, 28, 30)
        assert sorted(
            (attendance.status, attendance.absences, attendance.marked)
            for attendance in session.scalars(select(LessonAttendance))
        ) == [(LessonStatus.FALTA, 2, False), (LessonStatus.PRESENTE, 0, False)]


def test_agregado_retorna_apenas_atuais_identificadas_em_ordem_e_reutiliza_cache(
    logged, account
):
    account.classrooms.get_classroom_frequency.side_effect = [FREQUENCY, NOT_REGISTERED]
    response = logged.get("/classrooms/frequency")
    assert response.status_code == 200
    assert [
        {**item, "frequency": without_ids(item["frequency"])}
        for item in response.json()
    ] == [
        {"classroom": classroom_json(CURRENT), "frequency": FREQUENCY_JSON},
        {"classroom": classroom_json(SECOND), "frequency": NOT_REGISTERED_JSON},
    ]
    assert account.classrooms.get_classroom_frequency.await_args_list == [
        call("HASH-A"),
        call("HASH-B"),
    ]
    assert account.classrooms.list_classrooms.await_count == 1
    assert logged.get("/classrooms/frequency").json() == response.json()
    assert account.classrooms.get_classroom_frequency.await_count == 2


def test_frequencia_sem_turmas_atuais_retorna_lista_vazia(logged, account):
    account.classrooms.list_classrooms.return_value = [OLD]
    assert logged.get("/classrooms/frequency").json() == []
    account.classrooms.get_classroom_frequency.assert_not_awaited()


def test_sem_lancamentos_preserva_progress_e_cache(logged, account, database):
    account.classrooms.get_classroom_frequency.return_value = NOT_REGISTERED
    for _ in range(2):
        response = logged.get(FREQ)
        assert response.status_code == 200
        assert response.json() == NOT_REGISTERED_JSON
    account.classrooms.get_classroom_frequency.assert_awaited_once()
    with database() as session:
        link = session.scalar(
            select(ClassroomParticipant).where(
                ClassroomParticipant.frequency_synced_at.is_not(None)
            )
        )
        assert (
            link.frequency_status,
            link.attended_hours,
            link.registered_hours,
        ) == (FrequencyStatus.NAO_REGISTRADA, None, None)


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


def test_mudanca_de_horario_recria_as_aulas_sem_situacao(logged, scheduled, database):
    logged.get(FREQ)
    response = _change_schedule(logged, scheduled, "24N12")
    assert _weekdays(response) == {0, 2}
    assert _lesson(response, "2026-09-16")["start_time"] == "19:00:00"


def test_mudanca_de_horario_preserva_as_aulas_com_situacao(logged, scheduled, database):
    lesson = _lesson(logged.get(FREQ), "2026-09-15")
    assert logged.patch(_mark(lesson), json={"status": "falta"}).status_code == 204
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


def test_marcacao_persiste_muda_de_status_e_pode_ser_removida(
    logged, scheduled, database
):
    path = _mark(_lesson(logged.get(FREQ), "2026-09-17"))
    for status in ("falta", "presente", "cancelada"):
        assert logged.patch(path, json={"status": status}).status_code == 204
        lesson = _lesson(logged.get(FREQ), "2026-09-17")
        assert (lesson["status"], lesson["marked"]) == (status, True)
    with database() as session:
        assert [
            (attendance.status, attendance.marked, attendance.absences)
            for attendance in session.scalars(select(LessonAttendance))
        ] == [(LessonStatus.CANCELADA, True, None)]
    assert logged.patch(path, json={"status": None}).status_code == 204
    lesson = _lesson(logged.get(FREQ), "2026-09-17")
    assert (lesson["status"], lesson["marked"]) == ("nao_registrada", False)
    assert logged.patch(path, json={"status": None}).status_code == 204


def test_marcacao_entra_nos_totais_da_frequencia(logged, account, depois_da_aula):
    path = _mark(_lesson(logged.get(FREQ), "2026-09-24"))
    assert logged.patch(path, json={"status": "falta"}).status_code == 204
    assert logged.get(FREQ).json()["totals"] == {
        "presences": 1,
        "absences": 3,
        "percentage": 90.3,
        "max_absences": 22,
        "estimated": True,
    }


def test_chamada_do_sigaa_substitui_a_marcacao(logged, scheduled):
    path = _mark(_lesson(logged.get(FREQ), "2026-09-15"))
    assert logged.patch(path, json={"status": "presente"}).status_code == 204

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
    assert logged.patch(path, json={"status": "presente"}).status_code == 409
    assert logged.patch(path, json={"status": None}).status_code == 204
    assert _lesson(logged.get(FREQ), "2026-09-15")["status"] == "falta"


def test_chamada_de_uma_das_aulas_no_mesmo_dia_preserva_a_outra(logged, scheduled):
    scheduled.classrooms.list_classrooms.return_value = [
        CURRENT.model_copy(update={"schedule": "3M12 3T45"})
    ]
    response = logged.get(FREQ)
    for start_time in ("08:00:00", "16:00:00"):
        path = _mark(_lesson(response, "2026-09-15", start_time))
        assert logged.patch(path, json={"status": "falta"}).status_code == 204

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
    path = _mark(_lesson(logged.get(FREQ), "2026-09-17"))
    assert logged.patch(path, json={"status": "falta"}).status_code == 204
    response = logged.get(FREQ, headers=NO_CACHE)
    assert _lesson(response, "2026-09-17")["marked"] is True


def test_marcacao_exige_login_aula_e_turma_do_aluno(client, logged, scheduled):
    scheduled.classrooms.list_classrooms.return_value = [
        SCHEDULED,
        SECOND.model_copy(update={"schedule": "35T23"}),
    ]
    lesson = _lesson(logged.get(FREQ), "2026-09-17")
    other = _lesson(logged.get("/classrooms/HASH-B/frequency"), "2026-09-17")
    body = {"status": "falta"}
    assert logged.patch(_mark(lesson), json=body).status_code == 204
    for path in (
        _mark(lesson, "UNKNOWN"),
        _mark(other),
        f"{FREQ}/lessons/{uuid4()}",
    ):
        assert logged.patch(path, json=body).status_code == 404
        assert logged.patch(path, json={"status": None}).status_code == 404
    logged.cookies.clear()
    assert client.patch(_mark(lesson), json=body).status_code == 401
    assert client.patch(_mark(lesson), json={"status": None}).status_code == 401


def test_marcacoes_nao_sao_compartilhadas_entre_alunos(logged, scheduled, cookies):
    path = _mark(_lesson(logged.get(FREQ), "2026-09-17"))
    assert logged.patch(path, json={"status": "falta"}).status_code == 204
    _switch_to_other_student(logged, scheduled, cookies)
    response = logged.get(FREQ)
    assert not any(lesson["marked"] for lesson in response.json()["lessons"])
    _switch_back(logged, cookies)
    assert _lesson(logged.get(FREQ), "2026-09-17")["marked"] is True


def test_marcacao_valida_dados(logged, scheduled):
    path = _mark(_lesson(logged.get(FREQ), "2026-09-17"))
    assert logged.patch(path, json={"status": "nao_registrada"}).status_code == 422
    assert logged.patch(path, json={}).status_code == 422
    assert (
        logged.patch(f"{FREQ}/lessons/ontem", json={"status": "falta"}).status_code
        == 422
    )
    assert (
        logged.patch(f"{FREQ}/lessons/ontem", json={"status": None}).status_code == 422
    )


def test_marcacao_de_aula_que_ainda_nao_aconteceu_e_recusada(
    logged, scheduled, database
):
    logged.get(FREQ)
    with database() as session:
        future = session.scalar(
            select(Lesson).where(Lesson.occurred_on == date(2026, 10, 1))
        )
    response = logged.patch(f"{FREQ}/lessons/{future.id}", json={"status": "falta"})
    assert response.status_code == 422
    with database() as session:
        assert list(session.scalars(select(LessonAttendance))) == []


def test_refresh_reconsulta_sigaa_e_atualiza_mesmo_cache(logged, account):
    logged.get(FREQ)
    account.classrooms.get_classroom_frequency.return_value = NOT_REGISTERED
    response = logged.get("/classrooms/1614141/frequency", headers=NO_CACHE)
    assert response.json() == NOT_REGISTERED_JSON
    assert logged.get(FREQ).json() == NOT_REGISTERED_JSON
    assert account.classrooms.get_classroom_frequency.await_count == 2


def test_refresh_agregado_atualiza_lista_e_so_consulta_turmas_que_continuam_ativas(
    logged, account
):
    logged.get("/classrooms/frequency")
    account.classrooms.list_classrooms.return_value = [OLD, SECOND]
    account.classrooms.get_classroom_frequency.reset_mock()
    response = logged.get("/classrooms/frequency", headers=NO_CACHE)
    assert response.status_code == 200
    assert [item["classroom"]["id"] for item in response.json()] == ["HASH-B"]
    account.classrooms.get_classroom_frequency.assert_awaited_once_with("HASH-B")
    assert account.classrooms.list_classrooms.await_count == 2


def test_cache_vencido_revalida_por_job_do_aluno_e_turma(
    logged, account, database, qstash
):
    logged.get(FREQ)
    age_cache(database)
    account.classrooms.get_classroom_frequency.return_value = NOT_REGISTERED
    response = logged.get("/classrooms/1614141/frequency")
    assert without_ids(response.json()) == FREQUENCY_JSON
    assert logged.get(FREQ).json() == NOT_REGISTERED_JSON
    assert [
        (job.registration, job.classroom_id, job.steps) for job in qstash.jobs()
    ] == [(CREDENCIAIS.registration, "HASH-A", (Step.of(sync_frequency),))]


def test_frequencia_de_semestre_passado_por_hash_nao_vence(logged, account, database):
    logged.get("/classrooms/HASH-OLD/frequency")
    age_cache(database, days=365)
    response = logged.get("/classrooms/HASH-OLD/frequency")
    assert without_ids(response.json()) == FREQUENCY_JSON
    account.classrooms.get_classroom_frequency.assert_awaited_once_with("HASH-OLD")


def test_agregado_explicita_ausencia_sem_inventar_saldo_de_faltas(logged, account):
    account.classrooms.get_classroom_frequency.return_value = NOT_REGISTERED
    response = logged.get("/classrooms/frequency")
    assert response.status_code == 200
    for item in response.json():
        assert item["frequency"]["frequency_status"] == "nao_registrada"
        assert item["frequency"]["totals"] is None
        assert item["frequency"]["progress"] == NOT_REGISTERED.progress.model_dump()
        assert "sigaa_id" not in item["classroom"]["subject"]
        assert item["classroom"]["sigaa_id"] is not None


def test_dois_alunos_na_mesma_turma_dividem_as_aulas_mas_nao_a_frequencia(
    logged, account, cookies, database
):
    first = logged.get("/classrooms/1614141/frequency").json()
    _switch_to_other_student(logged, account, cookies)
    account.classrooms.get_classroom_frequency.return_value = _with_entries(
        AttendanceEntry(
            occurred_on=date(2026, 9, 20), status=AttendanceStatus.FALTA, absences=1
        ),
        *FREQUENCY.frequency.entries[1:],
    )
    second = logged.get("/classrooms/1614141/frequency").json()
    assert _lesson_ids(second) == _lesson_ids(first)
    assert [lesson["status"] for lesson in second["lessons"]] == [
        "nao_registrada",
        "falta",
        "falta",
    ]
    with database() as session:
        assert (
            len(
                session.scalars(
                    select(ClassroomParticipant.user_id).where(
                        ClassroomParticipant.frequency_synced_at.is_not(None)
                    )
                ).all()
            )
            == 2
        )
    _switch_back(logged, cookies)
    assert logged.get("/classrooms/1614141/frequency").json() == first
    assert account.classrooms.get_classroom_frequency.await_count == 2


def _lesson_ids(frequency: dict) -> list[str]:
    return [lesson["id"] for lesson in frequency["lessons"]]


def test_id_numerico_de_turma_de_outro_aluno_nao_da_acesso(logged, account, cookies):
    logged.get("/classrooms/1614141/frequency")
    _switch_to_other_student(logged, account, cookies)
    account.classrooms.list_classrooms.return_value = [SECOND]
    account.classrooms.get_classroom_frequency.reset_mock()
    assert logged.get("/classrooms/1614141/frequency").status_code == 404
    account.classrooms.get_classroom_frequency.assert_not_awaited()


@pytest.mark.parametrize("identifier", ["UNKNOWN", "999999", "9" * 100, "0", "-1"])
def test_frequencia_de_turma_nao_encontrada_retorna_404(logged, account, identifier):
    assert logged.get(f"/classrooms/{identifier}/frequency").status_code == 404
    account.classrooms.get_classroom_frequency.assert_not_awaited()


@pytest.mark.parametrize("path", ["/classrooms/frequency", FREQ])
def test_frequencia_exige_autenticacao(client, account, path):
    assert client.get(path).status_code == 401
    account.created.assert_not_called()


@pytest.mark.parametrize(
    "error,status",
    [
        (SessionExpired(), 401),
        (SigaaParseError("fora"), 502),
        (ClassroomNotFound(), 404),
    ],
)
def test_erros_de_consulta_nao_viram_frequencia_vazia(logged, account, error, status):
    account.classrooms.get_classroom_frequency.side_effect = error
    assert logged.get(FREQ).status_code == status


@pytest.mark.parametrize(
    "error,status",
    [
        (SessionExpired(), 401),
        (ClassroomNotFound(), 404),
        (SigaaParseError("fora"), 200),
    ],
)
def test_stale_if_error_so_cobre_falha_da_origem(logged, account, error, status):
    logged.get(FREQ)
    account.classrooms.get_classroom_frequency.side_effect = error

    response = logged.get(FREQ, headers={"Cache-Control": "no-cache, stale-if-error"})

    assert response.status_code == status


def test_agregado_nao_omite_turma_com_erro(logged, account):
    account.classrooms.get_classroom_frequency.side_effect = [
        FREQUENCY,
        SigaaParseError("fora"),
    ]
    response = logged.get("/classrooms/frequency")
    assert response.status_code == 502


def test_falha_de_refresh_preserva_cache_anterior(logged, account):
    logged.get(FREQ)
    account.classrooms.get_classroom_frequency.side_effect = SigaaParseError("fora")
    assert logged.get(FREQ, headers=NO_CACHE).status_code == 502
    assert without_ids(logged.get(FREQ).json()) == FREQUENCY_JSON


def test_turma_que_sai_da_lista_some_mas_guarda_o_motivo(logged, account, database):
    logged.get(FREQ)
    account.classrooms.list_classrooms.return_value = [SECOND]
    logged.get("/classrooms", headers=NO_CACHE)

    assert logged.get(FREQ).status_code == 404
    with database() as session:
        link = session.scalar(
            select(ClassroomParticipant).where(
                ClassroomParticipant.frequency_synced_at.is_not(None)
            )
        )
        assert (link.front_end_id, link.current, link.status) == (
            None,
            False,
            ClassroomStatus.TRANCADO,
        )


def test_openapi_documenta_frequencia_e_marcacao(client):
    paths = client.get("/openapi.json").json()["paths"]
    for path in ("/classrooms/frequency", "/classrooms/{classroom_id}/frequency"):
        route = paths[path]["get"]
        assert {"401", "404", "502", "503"} <= route["responses"].keys()
        assert any(p["name"] == "Cache-Control" for p in route["parameters"])
    mark = paths["/classrooms/{classroom_id}/frequency/lessons/{lesson_id}"]
    assert {"404", "409", "422"} <= mark["patch"]["responses"].keys()
    assert mark.keys() == {"patch"}
