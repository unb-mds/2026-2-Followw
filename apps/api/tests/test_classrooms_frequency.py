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

from api.db.models import ClassroomFrequencyCache, ClassroomUser
from api.dependencies.qstash import decode_job
from api.services.sync import Task

CREDENTIALS = Credentials(registration="251000000", password=SecretStr("senha"))
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


@pytest.fixture
def account(stub_sigaa):
    stub_sigaa.classrooms.list_classrooms.return_value = [SECOND, OLD, CURRENT]
    stub_sigaa.classrooms.get_classroom_frequency = AsyncMock(return_value=FREQUENCY)
    return stub_sigaa


@pytest.fixture
def logged(client, cookies):
    client.cookies.update(cookies(access="tok", refresh=CREDENTIALS))
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
        assert response.json() == FREQUENCY.model_dump(mode="json")
        assert response.headers["cache-control"] == "no-store"
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
            "classroom": CURRENT.model_dump(mode="json"),
            **FREQUENCY.model_dump(mode="json"),
        },
        {
            "classroom": SECOND.model_dump(mode="json"),
            **NOT_REGISTERED.model_dump(mode="json"),
        },
    ]
    assert account.classrooms.get_classroom_frequency.await_args_list == [
        call("HASH-A"),
        call("HASH-B"),
    ]
    assert account.classrooms.list_classrooms.await_count == 1
    assert logged.get("/classrooms/frequency").json() == response.json()
    assert account.classrooms.get_classroom_frequency.await_count == 2


def test_sem_turmas_atuais_retorna_lista_vazia(logged, account):
    account.classrooms.list_classrooms.return_value = [OLD]
    assert logged.get("/classrooms/frequency").json() == []
    account.classrooms.get_classroom_frequency.assert_not_awaited()


def test_sem_lancamentos_preserva_progress_e_cache(logged, account):
    account.classrooms.get_classroom_frequency.return_value = NOT_REGISTERED
    for _ in range(2):
        response = logged.get("/classrooms/HASH-A/frequency")
        assert response.status_code == 200
        assert response.json() == NOT_REGISTERED.model_dump(mode="json")
    account.classrooms.get_classroom_frequency.assert_awaited_once()


def test_refresh_reconsulta_sigaa_e_atualiza_mesmo_cache(logged, account):
    logged.get("/classrooms/HASH-A/frequency")
    account.classrooms.get_classroom_frequency.return_value = NOT_REGISTERED
    assert logged.get(
        "/classrooms/1614141/frequency?refresh=true"
    ).json() == NOT_REGISTERED.model_dump(mode="json")
    assert logged.get(
        "/classrooms/HASH-A/frequency"
    ).json() == NOT_REGISTERED.model_dump(mode="json")
    assert account.classrooms.get_classroom_frequency.await_count == 2


def test_refresh_agregado_atualiza_lista_e_so_consulta_turmas_que_continuam_ativas(
    logged, account
):
    logged.get("/classrooms/frequency")
    account.classrooms.list_classrooms.return_value = [OLD, SECOND]
    account.classrooms.get_classroom_frequency.reset_mock()
    response = logged.get("/classrooms/frequency?refresh=true")
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
    assert logged.get("/classrooms/1614141/frequency").json() == FREQUENCY.model_dump(
        mode="json"
    )
    assert logged.get(
        "/classrooms/HASH-A/frequency"
    ).json() == NOT_REGISTERED.model_dump(mode="json")
    jobs = [decode_job(item["body"].encode()) for item in qstash.published]
    assert [(j.task, j.registration, j.classroom_id) for j in jobs] == [
        (Task.FREQUENCY, CREDENTIALS.registration, "HASH-A")
    ]


def test_frequencia_de_semestre_passado_por_hash_nao_vence(logged, account, database):
    logged.get("/classrooms/HASH-OLD/frequency")
    age_cache(database, days=365)
    assert logged.get("/classrooms/HASH-OLD/frequency").json() == FREQUENCY.model_dump(
        mode="json"
    )
    account.classrooms.get_classroom_frequency.assert_awaited_once_with("HASH-OLD")


def test_cache_invalido_e_refeito(logged, account, database):
    logged.get("/classrooms/HASH-A/frequency")
    with database() as session:
        session.execute(update(ClassroomFrequencyCache).values(data={}))
        session.commit()
    assert logged.get("/classrooms/HASH-A/frequency").json() == FREQUENCY.model_dump(
        mode="json"
    )
    assert account.classrooms.get_classroom_frequency.await_count == 2


def test_cache_antigo_ganha_estado_e_resumo_sem_nova_consulta(
    logged, account, database
):
    logged.get("/classrooms/HASH-A/frequency")
    data = FREQUENCY.model_dump(mode="json")
    data.pop("frequency_status")
    data["frequency"].pop("summary")
    with database() as session:
        session.execute(update(ClassroomFrequencyCache).values(data=data))
        session.commit()
    response = logged.get("/classrooms/HASH-A/frequency")
    assert response.status_code == 200
    assert response.json()["frequency_status"] == "partially_registered"
    assert response.json()["frequency"]["summary"] == {
        "total_entries": 3,
        "recorded_entries": 2,
        "unrecorded_entries": 1,
        "absence_entries": 1,
        "total_absences": 2,
    }
    assert response.json()["frequency"]["registered"] == 30
    account.classrooms.get_classroom_frequency.assert_awaited_once()


def test_agregado_explicita_ausencia_sem_inventar_saldo_de_faltas(logged, account):
    account.classrooms.get_classroom_frequency.return_value = NOT_REGISTERED
    response = logged.get("/classrooms/frequency")
    assert response.status_code == 200
    for item in response.json():
        assert item["frequency_status"] == "not_registered"
        assert item["frequency"] is None
        assert item["progress"] == NOT_REGISTERED.progress.model_dump()
        assert item["classroom"]["subject"]["sigaa_id"] is None
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
    assert logged.get(
        "/classrooms/1614141/frequency"
    ).json() == NOT_REGISTERED.model_dump(mode="json")
    with database() as session:
        rows = list(session.scalars(select(ClassroomFrequencyCache)))
        assert len(rows) == 2
        assert len({row.user_classroom_id for row in rows}) == 2
    logged.cookies.clear()
    logged.cookies.update(cookies(access="tok", refresh=CREDENTIALS))
    assert logged.get("/classrooms/1614141/frequency").json() == FREQUENCY.model_dump(
        mode="json"
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
def test_turma_nao_encontrada_retorna_404(logged, account, identifier):
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
    assert logged.get("/classrooms/HASH-A/frequency?refresh=true").status_code == 502
    assert logged.get("/classrooms/HASH-A/frequency").json() == FREQUENCY.model_dump(
        mode="json"
    )


def test_remover_vinculo_remove_cache_individual(logged, account, database):
    logged.get("/classrooms/HASH-A/frequency")
    account.classrooms.list_classrooms.return_value = [SECOND]
    logged.get("/classrooms?refresh=true")
    with database() as session:
        assert session.scalar(select(ClassroomFrequencyCache)) is None
        assert (
            session.scalar(
                select(ClassroomUser).where(ClassroomUser.front_end_id == "HASH-A")
            )
            is None
        )


def test_openapi_documenta_frequencia_individual_e_agregada(client):
    paths = client.get("/openapi.json").json()["paths"]
    for path in ("/classrooms/frequency", "/classrooms/{classroom_id}/frequency"):
        route = paths[path]["get"]
        assert {"401", "404", "502", "503"} <= route["responses"].keys()
        assert any(p["name"] == "refresh" for p in route["parameters"])
