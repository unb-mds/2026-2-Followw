from datetime import date
from unittest.mock import call

import pytest
from sigaa_client import (
    AttendanceEntry,
    AttendanceStatus,
    ClassroomNotFound,
    FrequencyStatus,
    SessionExpired,
    SigaaParseError,
)
from sqlalchemy import select

from api.db.enums import ClassroomStatus, LessonStatus
from api.db.models import Classroom as ClassroomRow
from api.db.models import ClassroomParticipant, LessonAttendance
from api.modules.classrooms.frequency import sync_frequency
from api.sync.engine import Step

from .helpers import (
    CREDENCIAIS,
    CURRENT,
    FREQ,
    FREQUENCY,
    FREQUENCY_JSON,
    NO_CACHE,
    NOT_REGISTERED,
    NOT_REGISTERED_JSON,
    OLD,
    SECOND,
    _lesson_ids,
    _switch_back,
    _switch_to_other_student,
    _with_entries,
    age_cache,
    classroom_json,
    without_ids,
)


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
            session.get(ClassroomRow, link.classroom_id).progress_taught,
        ) == (FrequencyStatus.PARCIALMENTE_REGISTRADA, 30)
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
            session.get(ClassroomRow, link.classroom_id).progress_taught,
        ) == (FrequencyStatus.NAO_REGISTRADA, 30)


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
        (SessionExpired(), 502),
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
        (SessionExpired(), 200),
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


def test_turma_que_sai_da_lista_vira_trancada(logged, account, database):
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
        assert link.locked_at is not None


def test_openapi_documenta_frequencia_e_marcacao(client):
    paths = client.get("/openapi.json").json()["paths"]
    for path in ("/classrooms/frequency", "/classrooms/{classroom_id}/frequency"):
        route = paths[path]["get"]
        assert {"401", "404", "502", "503"} <= route["responses"].keys()
        assert any(p["name"] == "Cache-Control" for p in route["parameters"])
    mark = paths["/classrooms/{classroom_id}/frequency/lessons"]
    assert {"404", "409", "422"} <= mark["patch"]["responses"].keys()
    assert mark.keys() == {"patch"}
