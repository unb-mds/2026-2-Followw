from datetime import UTC, date, datetime, timedelta
from unittest.mock import AsyncMock, call

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
    SessionExpired,
    SigaaParseError,
    Subject,
)
from sqlalchemy import select, update

from api.academic_calendar import class_days
from api.db.enums import ClassroomStatus, LessonStatus
from api.db.models import ClassroomFrequencyCache, ClassroomUser, LessonMark
from api.modules.classrooms.frequency import sync_frequency
from api.modules.classrooms.lessons import (
    ClassroomFrequencyView,
    FrequencyTotals,
    Timetable,
    max_absences,
)
from api.sync.engine import Step

CREDENCIAIS = Credentials(registration="251000000", password=SecretStr("senha123"))
NO_CACHE = {"Cache-Control": "no-cache"}

CURRENT = Classroom(
    id="HASH-A",
    sigaa_id=1614141,
    number="12",
    semester="2026.2",
    current=True,
    subject=Subject(code="MAT0027", name="CÁLCULO 3", hours=90),
)
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


def frequency_view_json(
    frequency: ClassroomFrequency, classroom: Classroom = CURRENT
) -> dict:
    return ClassroomFrequencyView.build(
        frequency,
        {},
        schedule=classroom.schedule,
        subject_hours=classroom.subject.hours,
        days=class_days(classroom.semester) if classroom.current else (),
    ).model_dump(mode="json")


def classroom_json(classroom: Classroom) -> dict:
    data = classroom.model_dump(mode="json")
    del data["subject"]["sigaa_id"]
    return {**data, "grade": None}


def _view(
    frequency: ClassroomFrequency, schedule: str | None, marks=None, days=()
) -> ClassroomFrequencyView:
    return ClassroomFrequencyView.build(
        frequency, marks or {}, schedule=schedule, subject_hours=90, days=days
    )


def _with_entries(*entries: AttendanceEntry) -> ClassroomFrequency:
    return ClassroomFrequency(
        progress=FREQUENCY.progress,
        frequency=FREQUENCY.frequency.model_copy(update={"entries": entries}),
    )


def _keys(view: ClassroomFrequencyView) -> list[tuple[date, int, LessonStatus]]:
    return [
        (lesson.occurred_on, lesson.position, lesson.status) for lesson in view.lessons
    ]


def test_horario_vira_aulas_por_dia_com_suas_horas_aula():
    assert Timetable.parse("35T23").sessions == {1: (2,), 3: (2,)}
    # Horários consecutivos são uma aula só, mesmo entre turnos ou blocos; separados, duas.
    assert Timetable.parse("35M5 35T1").sessions == {1: (2,), 3: (2,)}
    assert Timetable.parse("3M12 3M34").sessions == {1: (4,)}
    assert Timetable.parse("3M12 3T45").sessions == {1: (2, 2)}
    assert Timetable.parse("6M1234 6M12").sessions == {4: (4,)}
    assert Timetable.parse(None).sessions == {}
    assert Timetable.parse("99Z9 2N6").sessions == {}


def test_aula_fora_do_horario_vale_o_tamanho_usual():
    timetable = Timetable.parse("2M12 4M123 6M123")
    assert timetable.hours(date(2026, 8, 10), 0) == 2
    assert timetable.hours(date(2026, 8, 10), 1) == 3
    assert timetable.hours(date(2026, 8, 15), 0) == 3
    assert Timetable.parse(None).hours(date(2026, 8, 10), 0) == 1


def test_aulas_previstas_respeitam_periodo_horario_e_dia_atual():
    view = _view(
        NOT_REGISTERED, "35M5 35T1", days=class_days("2026.2", on=date(2026, 8, 14))
    )
    assert _keys(view) == [
        (date(2026, 8, 13), 0, LessonStatus.NAO_REGISTRADA),
        (date(2026, 8, 11), 0, LessonStatus.NAO_REGISTRADA),
    ]
    assert {lesson.hours for lesson in view.lessons} == {2}


def test_aulas_previstas_completam_as_chamadas_publicadas_no_mesmo_dia():
    frequency = _with_entries(
        AttendanceEntry(occurred_on=date(2026, 8, 11), status=AttendanceStatus.PRESENTE)
    )
    view = _view(
        frequency, "3M12 3T45", days=class_days("2026.2", on=date(2026, 8, 12))
    )
    assert _keys(view) == [
        (date(2026, 8, 11), 1, LessonStatus.NAO_REGISTRADA),
        (date(2026, 8, 11), 0, LessonStatus.PRESENTE),
    ]


def test_aulas_previstas_nao_inventam_dias_sem_horario():
    assert _view(NOT_REGISTERED, None, days=class_days("2026.2")).lessons == ()


def test_marcacao_vale_so_onde_o_sigaa_nao_registrou_e_falta_conta_as_horas_aula():
    marks = {
        (date(2026, 9, 20), 0): LessonStatus.FALTA,
        (date(2026, 9, 24), 0): LessonStatus.FALTA,
        (date(2026, 9, 25), 0): LessonStatus.CANCELADA,
    }
    assert [
        (lesson.occurred_on, lesson.status, lesson.absences, lesson.marked)
        for lesson in _view(FREQUENCY, "2346T23", marks).lessons
    ] == [
        (date(2026, 9, 25), LessonStatus.CANCELADA, 0, True),
        (date(2026, 9, 24), LessonStatus.FALTA, 2, True),
        (date(2026, 9, 22), LessonStatus.FALTA, 2, False),
        (date(2026, 9, 20), LessonStatus.PRESENTE, 0, False),
    ]


def test_totais_somam_marcacoes_em_horas_aula_e_ignoram_canceladas():
    marks = {
        (date(2026, 9, 24), 0): LessonStatus.FALTA,
        (date(2026, 9, 25), 0): LessonStatus.PRESENTE,
        (date(2026, 9, 28), 0): LessonStatus.CANCELADA,
    }
    assert _view(FREQUENCY, "2346T23", marks).totals == FrequencyTotals(
        presences=2, absences=4, percentage=88.2, max_absences=22, estimated=True
    )
    assert _view(FREQUENCY, "2346T23").totals == FrequencyTotals(
        presences=1, absences=2, percentage=93.8, max_absences=22, estimated=False
    )


@pytest.mark.parametrize(
    "hours,expected",
    [(30, 6), (60, 14), (90, 22), (15, 2), (7, 0), (0, None), (None, None)],
)
def test_maximo_de_faltas_pela_carga_horaria(hours, expected):
    assert max_absences(hours) == expected


def test_aula_sem_chamada_conta_como_presenca_so_na_porcentagem():
    # 28 de 30 horas-aula do SIGAA + a aula de 24/09 (2h) sem chamada.
    totals = _view(FREQUENCY, "2346T23").totals
    assert (totals.presences, totals.absences, totals.percentage) == (1, 2, 93.8)
    # Cancelada fica de fora: a porcentagem volta à do SIGAA.
    cancelada = {(date(2026, 9, 24), 0): LessonStatus.CANCELADA}
    assert _view(FREQUENCY, "2346T23", cancelada).totals.percentage == 93.3


def test_totais_sem_chamada_do_sigaa_vem_so_das_marcacoes():
    marks = {
        (date(2026, 9, 24), 0): LessonStatus.PRESENTE,
        (date(2026, 9, 25), 0): LessonStatus.FALTA,
    }
    assert _view(NOT_REGISTERED, "2346T23", marks).totals == FrequencyTotals(
        presences=1, absences=2, percentage=50, max_absences=22, estimated=True
    )
    cancelada = {(date(2026, 9, 24), 0): LessonStatus.CANCELADA}
    assert _view(NOT_REGISTERED, "2346T23", cancelada).totals is None


@pytest.fixture
def account(stub_sigaa):
    stub_sigaa.classrooms.list_classrooms.return_value = [SECOND, OLD, CURRENT]
    stub_sigaa.classrooms.get_classroom_frequency = AsyncMock(return_value=FREQUENCY)
    return stub_sigaa


@pytest.fixture
def logged(client, cookies):
    client.cookies.update(cookies(access="tok", refresh=CREDENCIAIS))
    return client


def age_cache(database, *, days=2):
    with database() as session:
        session.execute(
            update(ClassroomFrequencyCache).values(
                synced_at=datetime.now(UTC) - timedelta(days=days)
            )
        )
        session.commit()


def test_ids_numerico_e_hash_retornam_todos_os_campos_e_usam_o_mesmo_cache(
    logged, account, database, qstash
):
    for identifier in ("1614141", "HASH-A", "1614141"):
        response = logged.get(f"/classrooms/{identifier}/frequency")
        assert response.status_code == 200
        assert response.json() == frequency_view_json(FREQUENCY)
        assert response.headers["cache-control"] == "private, no-cache"
    account.classrooms.get_classroom_frequency.assert_awaited_once_with("HASH-A")
    assert qstash.published == []
    with database() as session:
        rows = list(session.scalars(select(ClassroomFrequencyCache)))
        assert len(rows) == 1
        assert rows[0].data == FREQUENCY.model_dump(mode="json")


def test_agregado_retorna_apenas_atuais_identificadas_em_ordem_e_reutiliza_cache(
    logged, account
):
    account.classrooms.get_classroom_frequency.side_effect = [FREQUENCY, NOT_REGISTERED]
    response = logged.get("/classrooms/frequency")
    assert response.status_code == 200
    assert response.json() == [
        {
            "classroom": classroom_json(CURRENT),
            "frequency": frequency_view_json(FREQUENCY),
        },
        {
            "classroom": classroom_json(SECOND),
            "frequency": frequency_view_json(NOT_REGISTERED, SECOND),
        },
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
        response = logged.get("/classrooms/HASH-A/frequency")
        assert response.status_code == 200
        assert response.json() == frequency_view_json(NOT_REGISTERED)
    account.classrooms.get_classroom_frequency.assert_awaited_once()
    with database() as session:
        row = session.scalar(select(ClassroomFrequencyCache))
        assert row.data == NOT_REGISTERED.model_dump(mode="json")


def test_rota_inclui_aulas_passadas_sem_lancamento_sem_inventar_totais(logged, account):
    account.classrooms.get_classroom_frequency.return_value = NOT_REGISTERED
    account.classrooms.list_classrooms.return_value = [
        CURRENT.model_copy(update={"schedule": "35T23"})
    ]
    response = logged.get("/classrooms/HASH-A/frequency")
    assert response.status_code == 200
    data = response.json()
    assert data["frequency_status"] == "nao_registrada"
    assert data["totals"] is None
    assert {
        "occurred_on": "2026-08-11",
        "position": 0,
        "status": "nao_registrada",
        "hours": 2,
        "absences": 0,
        "marked": False,
    } in data["lessons"]
    assert all(lesson["occurred_on"] < "2026-09-22" for lesson in data["lessons"])


@pytest.mark.parametrize("frequency", [NOT_REGISTERED, FREQUENCY])
def test_turma_antiga_nao_gera_aulas_previstas(logged, account, frequency):
    old = CURRENT.model_copy(
        update={"semester": "2026.1", "current": False, "schedule": "35T23"}
    )
    account.classrooms.list_classrooms.return_value = [old]
    account.classrooms.get_classroom_frequency.return_value = frequency

    response = logged.get("/classrooms/HASH-A/frequency")

    assert response.status_code == 200
    assert response.json() == frequency_view_json(frequency, old)
    assert len(response.json()["lessons"]) == len(
        frequency.frequency.entries if frequency.frequency else ()
    )


LESSON = "/classrooms/HASH-A/frequency/lessons/2026-09-24/0"


def _lesson(response, occurred_on: str, position: int = 0) -> dict:
    return next(
        lesson
        for lesson in response.json()["lessons"]
        if (lesson["occurred_on"], lesson["position"]) == (occurred_on, position)
    )


def test_marcacao_persiste_muda_de_status_e_pode_ser_removida(
    logged, account, database
):
    for status in ("falta", "presente", "cancelada"):
        assert logged.put(LESSON, json={"status": status}).status_code == 204
        lesson = _lesson(logged.get("/classrooms/HASH-A/frequency"), "2026-09-24")
        assert (lesson["status"], lesson["marked"]) == (status, True)
    with database() as session:
        marks = list(session.scalars(select(LessonMark)))
        assert [(m.occurred_on, m.position, m.status) for m in marks] == [
            (date(2026, 9, 24), 0, LessonStatus.CANCELADA)
        ]
    assert logged.delete(LESSON).status_code == 204
    lesson = _lesson(logged.get("/classrooms/HASH-A/frequency"), "2026-09-24")
    assert (lesson["status"], lesson["marked"]) == ("nao_registrada", False)
    assert logged.delete(LESSON).status_code == 204


def test_marcacao_entra_nos_totais_da_frequencia(logged, account):
    assert logged.put(LESSON, json={"status": "falta"}).status_code == 204
    response = logged.get("/classrooms/HASH-A/frequency")
    assert response.json()["totals"] == {
        "presences": 1,
        "absences": 3,
        "percentage": 90.3,
        "max_absences": 22,
        "estimated": True,
    }


def test_chamada_do_sigaa_prevalece_sobre_a_marcacao(logged, account):
    account.classrooms.get_classroom_frequency.return_value = NOT_REGISTERED
    path = "/classrooms/HASH-A/frequency/lessons/2026-09-22/0"
    assert logged.put(path, json={"status": "presente"}).status_code == 204
    lesson = _lesson(logged.get("/classrooms/HASH-A/frequency"), "2026-09-22")
    assert (lesson["status"], lesson["marked"]) == ("presente", True)

    account.classrooms.get_classroom_frequency.return_value = FREQUENCY
    response = logged.get("/classrooms/HASH-A/frequency", headers=NO_CACHE)
    lesson = _lesson(response, "2026-09-22")
    assert (lesson["status"], lesson["absences"], lesson["marked"]) == (
        "falta",
        2,
        False,
    )


def test_chamada_de_uma_das_aulas_no_mesmo_dia_preserva_a_outra(logged, account):
    account.classrooms.get_classroom_frequency.return_value = NOT_REGISTERED
    assert logged.put(LESSON, json={"status": "falta"}).status_code == 204
    second = LESSON.removesuffix("0") + "1"
    assert logged.put(second, json={"status": "falta"}).status_code == 204
    account.classrooms.get_classroom_frequency.return_value = _with_entries(
        AttendanceEntry(
            occurred_on=date(2026, 9, 24), status=AttendanceStatus.NAO_REGISTRADA
        ),
        AttendanceEntry(
            occurred_on=date(2026, 9, 24), status=AttendanceStatus.PRESENTE
        ),
    )
    response = logged.get("/classrooms/HASH-A/frequency", headers=NO_CACHE)
    assert [
        (lesson["position"], lesson["status"], lesson["marked"])
        for lesson in response.json()["lessons"]
        if lesson["occurred_on"] == "2026-09-24"
    ] == [(1, "presente", False), (0, "falta", True)]


def test_refresh_preserva_marcacao(logged, account):
    assert logged.put(LESSON, json={"status": "falta"}).status_code == 204
    account.classrooms.get_classroom_frequency.return_value = NOT_REGISTERED
    response = logged.get("/classrooms/HASH-A/frequency", headers=NO_CACHE)
    assert _lesson(response, "2026-09-24")["marked"] is True


def test_marcacao_exige_login_e_turma_do_aluno(client, logged, account):
    body = {"status": "falta"}
    assert logged.put(LESSON, json=body).status_code == 204
    unknown = LESSON.replace("HASH-A", "UNKNOWN")
    assert logged.put(unknown, json=body).status_code == 404
    assert logged.delete(unknown).status_code == 404
    logged.cookies.clear()
    assert client.put(LESSON, json=body).status_code == 401
    assert client.delete(LESSON).status_code == 401


def test_marcacoes_nao_sao_compartilhadas_entre_alunos(logged, account, cookies):
    assert logged.put(LESSON, json={"status": "falta"}).status_code == 204
    other = Credentials(registration="252000000", password=SecretStr("outra"))
    logged.cookies.clear()
    logged.cookies.update(cookies(access="other-token", refresh=other))
    account.profile.get_profile.return_value = (
        account.profile.get_profile.return_value.model_copy(
            update={"registration": other.registration}
        )
    )
    response = logged.get("/classrooms/HASH-A/frequency")
    assert not any(lesson["marked"] for lesson in response.json()["lessons"])
    logged.cookies.clear()
    logged.cookies.update(cookies(access="tok", refresh=CREDENCIAIS))
    response = logged.get("/classrooms/HASH-A/frequency")
    assert _lesson(response, "2026-09-24")["marked"] is True


def test_marcacao_valida_dados(logged, account):
    assert logged.put(LESSON, json={"status": "nao_registrada"}).status_code == 422
    assert logged.put(LESSON, json={}).status_code == 422
    for path in (
        "/classrooms/HASH-A/frequency/lessons/2026-09-24/-1",
        "/classrooms/HASH-A/frequency/lessons/ontem/0",
    ):
        assert logged.put(path, json={"status": "falta"}).status_code == 422
        assert logged.delete(path).status_code == 422


def test_refresh_reconsulta_sigaa_e_atualiza_mesmo_cache(logged, account):
    logged.get("/classrooms/HASH-A/frequency")
    account.classrooms.get_classroom_frequency.return_value = NOT_REGISTERED
    assert logged.get(
        "/classrooms/1614141/frequency", headers=NO_CACHE
    ).json() == frequency_view_json(NOT_REGISTERED)
    assert logged.get("/classrooms/HASH-A/frequency").json() == frequency_view_json(
        NOT_REGISTERED
    )
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
    logged.get("/classrooms/HASH-A/frequency")
    age_cache(database)
    account.classrooms.get_classroom_frequency.return_value = NOT_REGISTERED
    assert logged.get("/classrooms/1614141/frequency").json() == frequency_view_json(
        FREQUENCY
    )
    assert logged.get("/classrooms/HASH-A/frequency").json() == frequency_view_json(
        NOT_REGISTERED
    )
    assert [
        (job.registration, job.classroom_id, job.steps) for job in qstash.jobs()
    ] == [(CREDENCIAIS.registration, "HASH-A", (Step.of(sync_frequency),))]


def test_frequencia_de_semestre_passado_por_hash_nao_vence(logged, account, database):
    logged.get("/classrooms/HASH-OLD/frequency")
    age_cache(database, days=365)
    assert logged.get("/classrooms/HASH-OLD/frequency").json() == frequency_view_json(
        FREQUENCY, OLD
    )
    account.classrooms.get_classroom_frequency.assert_awaited_once_with("HASH-OLD")


def test_cache_invalido_e_refeito(logged, account, database):
    logged.get("/classrooms/HASH-A/frequency")
    with database() as session:
        session.execute(update(ClassroomFrequencyCache).values(data={"entries": "x"}))
        session.commit()
    assert logged.get("/classrooms/HASH-A/frequency").json() == frequency_view_json(
        FREQUENCY
    )
    assert account.classrooms.get_classroom_frequency.await_count == 2


def test_cache_antigo_ganha_estado_e_resumo_sem_nova_consulta(
    logged, account, database
):
    logged.get("/classrooms/HASH-A/frequency")
    data = FREQUENCY.model_dump(mode="json")
    del data["frequency_status"], data["frequency"]["summary"]
    with database() as session:
        session.execute(update(ClassroomFrequencyCache).values(data=data))
        session.commit()
    response = logged.get("/classrooms/HASH-A/frequency")
    assert response.status_code == 200
    assert response.json() == frequency_view_json(FREQUENCY)
    account.classrooms.get_classroom_frequency.assert_awaited_once()


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


def test_dois_alunos_na_mesma_turma_nao_compartilham_frequencia(
    logged, account, cookies, database
):
    logged.get("/classrooms/1614141/frequency")
    other = Credentials(registration="252000000", password=SecretStr("outra"))
    logged.cookies.clear()
    logged.cookies.update(cookies(access="other-token", refresh=other))
    account.profile.get_profile.return_value = (
        account.profile.get_profile.return_value.model_copy(
            update={"registration": other.registration}
        )
    )
    account.classrooms.get_classroom_frequency.return_value = NOT_REGISTERED
    assert logged.get("/classrooms/1614141/frequency").json() == frequency_view_json(
        NOT_REGISTERED
    )
    with database() as session:
        rows = list(session.scalars(select(ClassroomFrequencyCache)))
        assert len(rows) == 2
        assert len({row.user_classroom_id for row in rows}) == 2
    logged.cookies.clear()
    logged.cookies.update(cookies(access="tok", refresh=CREDENCIAIS))
    assert logged.get("/classrooms/1614141/frequency").json() == frequency_view_json(
        FREQUENCY
    )
    assert account.classrooms.get_classroom_frequency.await_count == 2


def test_id_numerico_de_turma_de_outro_aluno_nao_da_acesso(logged, account, cookies):
    logged.get("/classrooms/1614141/frequency")
    other = Credentials(registration="252000000", password=SecretStr("outra"))
    logged.cookies.clear()
    logged.cookies.update(cookies(access="other-token", refresh=other))
    account.profile.get_profile.return_value = (
        account.profile.get_profile.return_value.model_copy(
            update={"registration": other.registration}
        )
    )
    account.classrooms.list_classrooms.return_value = [SECOND]
    account.classrooms.get_classroom_frequency.reset_mock()
    assert logged.get("/classrooms/1614141/frequency").status_code == 404
    account.classrooms.get_classroom_frequency.assert_not_awaited()


@pytest.mark.parametrize("identifier", ["UNKNOWN", "999999", "9" * 100, "0", "-1"])
def test_frequencia_de_turma_nao_encontrada_retorna_404(logged, account, identifier):
    assert logged.get(f"/classrooms/{identifier}/frequency").status_code == 404
    account.classrooms.get_classroom_frequency.assert_not_awaited()


@pytest.mark.parametrize(
    "path", ["/classrooms/frequency", "/classrooms/HASH-A/frequency"]
)
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
    assert logged.get("/classrooms/HASH-A/frequency").status_code == status


@pytest.mark.parametrize(
    "error,status",
    [
        (SessionExpired(), 401),
        (ClassroomNotFound(), 404),
        (SigaaParseError("fora"), 200),
    ],
)
def test_stale_if_error_so_cobre_falha_da_origem(logged, account, error, status):
    logged.get("/classrooms/HASH-A/frequency")
    account.classrooms.get_classroom_frequency.side_effect = error

    response = logged.get(
        "/classrooms/HASH-A/frequency",
        headers={"Cache-Control": "no-cache, stale-if-error"},
    )

    assert response.status_code == status


def test_agregado_nao_omite_turma_com_erro(logged, account):
    account.classrooms.get_classroom_frequency.side_effect = [
        FREQUENCY,
        SigaaParseError("fora"),
    ]
    response = logged.get("/classrooms/frequency")
    assert response.status_code == 502


def test_falha_de_refresh_preserva_cache_anterior(logged, account):
    logged.get("/classrooms/HASH-A/frequency")
    account.classrooms.get_classroom_frequency.side_effect = SigaaParseError("fora")
    assert (
        logged.get("/classrooms/HASH-A/frequency", headers=NO_CACHE).status_code == 502
    )
    assert logged.get("/classrooms/HASH-A/frequency").json() == frequency_view_json(
        FREQUENCY
    )


def test_turma_que_sai_da_lista_some_mas_guarda_o_motivo(logged, account, database):
    logged.get("/classrooms/HASH-A/frequency")
    account.classrooms.list_classrooms.return_value = [SECOND]
    logged.get("/classrooms", headers=NO_CACHE)

    assert logged.get("/classrooms/HASH-A/frequency").status_code == 404
    with database() as session:
        link = session.scalar(
            select(ClassroomUser).where(ClassroomUser.frequency_cache.has())
        )
        assert (link.front_end_id, link.current, link.status) == (
            None,
            False,
            ClassroomStatus.TRANCADO,
        )


def test_openapi_documenta_frequencia_individual_e_agregada(client):
    paths = client.get("/openapi.json").json()["paths"]
    for path in ("/classrooms/frequency", "/classrooms/{classroom_id}/frequency"):
        route = paths[path]["get"]
        assert {"401", "404", "502", "503"} <= route["responses"].keys()
        assert any(p["name"] == "Cache-Control" for p in route["parameters"])
