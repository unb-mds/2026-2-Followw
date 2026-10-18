from datetime import UTC, datetime, timedelta

import pytest
from sigaa_client import (
    Classroom,
    ClassroomGrade,
    ClassroomMember,
    ClassroomRole,
    Grade,
    SigaaError,
    Subject,
)
from sqlalchemy import select, update

from api.db.models import ClassroomParticipant, User

ATUAL = Classroom(
    id="AAA",
    number="01",
    semester="2026.2",
    current=True,
    subject=Subject(code="FGA0146", name="ESTRUTURAS DE DADOS 1"),
)
ANTIGA = Classroom(
    id="BBB",
    number="02",
    semester="2025.2",
    subject=Subject(code="FGA0158", name="ORIENTAÇÃO A OBJETOS"),
)


@pytest.fixture
def turmas(stub_sigaa):
    stub_sigaa.classrooms.list_classrooms.return_value = [ATUAL, ANTIGA]
    stub_sigaa.classrooms.list_classroom_members.return_value = [
        ClassroomMember(
            name="ALUNO", role=ClassroomRole.ALUNO, registration="251000000"
        )
    ]
    return stub_sigaa


def _login(client) -> None:
    client.post(
        "/auth/sigaa", json={"registration": "251000000", "password": "senha123"}
    )


def _mencoes_sincronizadas_em(database, synced_at: datetime) -> None:
    with database() as session:
        session.execute(update(User).values(grades_synced_at=synced_at))
        session.commit()


@pytest.mark.parametrize(
    "directive", [None, "stale-if-error", "only-if-cached", "no-cache, stale-if-error"]
)
def test_primeira_falha_nao_esconde_turmas_nem_inicia_ttl(
    client, turmas, database, directive
):
    turmas.classrooms.list_grades.side_effect = SigaaError("indisponível")
    _login(client)
    headers = {"Cache-Control": directive} if directive else {}
    response = client.get("/classrooms?semester=all", headers=headers)
    assert response.status_code == 200
    assert len(response.json()) == 2
    assert all(row["grade"] is None for row in response.json())
    with database() as session:
        assert session.scalar(select(User)).grades_synced_at is None

    turmas.classrooms.list_grades.side_effect = None
    turmas.classrooms.list_grades.return_value = [
        ClassroomGrade(subject_code="FGA0158", semester="2025.2", grade=Grade.SS)
    ]
    client.get("/classrooms?semester=all")
    response = client.get("/classrooms?semester=all")
    assert next(row for row in response.json() if row["id"] == "BBB")["grade"] == "SS"


def test_primeira_captura_repetida_apos_dez_segundos(client, turmas, qstash):
    turmas.classrooms.list_grades.side_effect = [
        SigaaError("falha transitória"),
        [ClassroomGrade(subject_code="FGA0158", semester="2025.2", grade=Grade.SS)],
    ]
    _login(client)
    retries = [m for m, job in zip(qstash.published, qstash.jobs()) if job.attempt == 2]
    assert len(retries) == 1
    assert retries[0]["headers"]["Upstash-Delay"] == "10s"
    assert client.get("/classrooms?semester=2025.2").json()[0]["grade"] == "SS"


def test_turmas_respondem_antes_da_primeira_captura(
    client, turmas, qstash, monkeypatch
):
    turmas.classrooms.list_grades.side_effect = SigaaError("indisponível")
    _login(client)
    turmas.classrooms.list_grades.reset_mock()
    monkeypatch.setattr(qstash, "deliver", lambda _: None)
    response = client.get("/classrooms?semester=all")
    assert response.status_code == 200
    assert len(response.json()) == 2
    turmas.classrooms.list_grades.assert_not_awaited()
    assert qstash.jobs()[-1].steps[0].task == "sync_grades"


def test_mencao_vem_com_a_turma_pelo_sync_do_login(client, sigaa, turmas, qstash):
    turmas.classrooms.list_grades.return_value = [
        ClassroomGrade(subject_code="FGA0146", semester="2026.2"),
        ClassroomGrade(subject_code="FGA0158", semester="2025.2", grade=Grade.MS),
    ]
    _login(client)

    response = client.get("/classrooms?semester=all")

    assert {c["id"]: c["grade"] for c in response.json()} == {"AAA": None, "BBB": "MS"}
    turmas.classrooms.list_grades.assert_awaited_once_with()
    assert all(
        "sync_grades" not in [step.task for step in job.steps] for job in qstash.jobs()
    )


def test_mencoes_vencidas_revalidam_o_relatorio(client, sigaa, turmas, database):
    turmas.classrooms.list_grades.return_value = [
        ClassroomGrade(subject_code="FGA0146", semester="2026.2", grade=Grade.MS),
        ClassroomGrade(subject_code="FGA0158", semester="2025.2", grade=Grade.SS),
    ]
    _login(client)
    _mencoes_sincronizadas_em(database, datetime.now(UTC) - timedelta(days=2))
    turmas.classrooms.list_grades.reset_mock()

    _login(client)

    turmas.classrooms.list_grades.assert_awaited_once_with()
    with database() as session:
        assert session.scalar(select(User.grades_synced_at)) > datetime.now(
            UTC
        ).replace(tzinfo=None) - timedelta(days=2)


@pytest.mark.parametrize("via_login", [False, True])
def test_relatorio_parcial_nao_congela_mencao_preenchida(
    client, turmas, database, via_login
):
    turmas.classrooms.list_classrooms.return_value = [ANTIGA]
    turmas.classrooms.list_grades.return_value = [
        ClassroomGrade(subject_code="FGA0158", semester="2025.2", grade=Grade.MI)
    ]
    _login(client)
    turmas.classrooms.list_grades.return_value = []
    response = client.get(
        "/classrooms?semester=all", headers={"Cache-Control": "no-cache"}
    )
    assert response.json()[0]["grade"] == "MI"
    turmas.classrooms.list_grades.reset_mock()
    for _ in range(3):
        client.get("/classrooms?semester=all")
    turmas.classrooms.list_grades.assert_not_awaited()

    _mencoes_sincronizadas_em(database, datetime.now(UTC) - timedelta(days=2))
    turmas.classrooms.list_grades.return_value = [
        ClassroomGrade(subject_code="FGA0158", semester="2025.2", grade=Grade.SS)
    ]
    if via_login:
        _login(client)
    else:
        client.get("/classrooms?semester=all")
    assert client.get("/classrooms?semester=all").json()[0]["grade"] == "SS"
    turmas.classrooms.list_grades.assert_awaited_once()


def test_mencoes_associam_codigo_e_semestre_sem_confundir_repeticao(client, turmas):
    antiga = ATUAL.model_copy(
        update={"id": "BBB", "semester": "2025.2", "current": False}
    )
    turmas.classrooms.list_classrooms.return_value = [ATUAL, antiga]
    turmas.classrooms.list_grades.return_value = [
        ClassroomGrade(subject_code="FGA0146", semester="2026.2", grade=Grade.MS),
        ClassroomGrade(subject_code="FGA0146", semester="2025.2", grade=Grade.MI),
        ClassroomGrade(subject_code="OUTRA", semester="2026.2", grade=Grade.SS),
    ]
    _login(client)

    assert {
        c["id"]: c["grade"] for c in client.get("/classrooms?semester=all").json()
    } == {"AAA": "MS", "BBB": "MI"}
    turmas.classrooms.list_grades.assert_awaited_once_with()


def test_mencoes_frescas_nao_releem_relatorio(client, turmas):
    _login(client)
    turmas.classrooms.list_grades.reset_mock()

    _login(client)

    turmas.classrooms.list_grades.assert_not_awaited()


def test_relatorio_sem_mencao_limpa_resultado_anterior(client, turmas, database):
    turmas.classrooms.list_grades.return_value = [
        ClassroomGrade(subject_code="FGA0146", semester="2026.2", grade=Grade.MS)
    ]
    _login(client)
    _mencoes_sincronizadas_em(database, datetime.now(UTC) - timedelta(days=2))
    turmas.classrooms.list_grades.return_value = [
        ClassroomGrade(subject_code="FGA0146", semester="2026.2")
    ]

    _login(client)

    assert client.get("/classrooms").json()[0]["grade"] is None


def test_falha_no_relatorio_preserva_mencoes_e_tenta_uma_vez(
    client, turmas, database, qstash
):
    turmas.classrooms.list_grades.return_value = [
        ClassroomGrade(subject_code="FGA0146", semester="2026.2", grade=Grade.MS)
    ]
    _login(client)
    synced_at = datetime.now(UTC) - timedelta(days=2)
    _mencoes_sincronizadas_em(database, synced_at)
    turmas.classrooms.list_grades.reset_mock()
    turmas.classrooms.list_grades.side_effect = SigaaError("relatório indisponível")

    _login(client)

    assert client.get("/classrooms").json()[0]["grade"] == "MS"
    assert turmas.classrooms.list_grades.await_count == 4
    with database() as session:
        link = session.scalar(
            select(ClassroomParticipant).where(
                ClassroomParticipant.front_end_id == "AAA"
            )
        )
        user = session.get(User, link.user_id)
        assert user.grades_synced_at == synced_at.replace(tzinfo=None)
    assert qstash.jobs()[-1].attempt == 2


def test_falha_no_relatorio_nao_impede_jobs_das_turmas(client, turmas, qstash):
    turmas.classrooms.list_grades.side_effect = SigaaError("relatório indisponível")

    _login(client)

    assert sorted(
        call.args[0]
        for call in turmas.classrooms.list_classroom_members.await_args_list
    ) == ["AAA", "BBB"]
    assert turmas.classrooms.list_grades.await_count == 2
    assert {response.status_code for response in qstash.deliveries} == {204}


@pytest.mark.parametrize("semester", ["2025.2", "all"])
def test_consulta_recupera_mencao_nula_de_semestre_consolidado(
    client, turmas, database, semester
):
    _login(client)
    _mencoes_sincronizadas_em(database, datetime.now(UTC) - timedelta(days=2))
    turmas.classrooms.list_grades.return_value = [
        ClassroomGrade(subject_code="FGA0158", semester="2025.2", grade=Grade.SS)
    ]
    turmas.classrooms.list_grades.reset_mock()

    response = client.get(
        f"/classrooms?semester={semester}", headers={"Cache-Control": "no-cache"}
    )

    assert response.status_code == 200
    assert next(c for c in response.json() if c["id"] == "BBB")["grade"] == "SS"
    turmas.classrooms.list_grades.assert_awaited_once_with()


def test_relatorio_parcial_preserva_mencao_e_registra_consulta(
    client, turmas, database
):
    turmas.classrooms.list_grades.return_value = [
        ClassroomGrade(subject_code="FGA0146", semester="2026.2", grade=Grade.MS)
    ]
    _login(client)
    old = datetime.now(UTC) - timedelta(days=2)
    _mencoes_sincronizadas_em(database, old)
    turmas.classrooms.list_grades.return_value = []

    response = client.get("/classrooms", headers={"Cache-Control": "no-cache"})

    assert response.status_code == 200
    assert response.json()[0]["grade"] == "MS"
    with database() as session:
        user = session.scalar(select(User))
        assert user.grades_synced_at > old.replace(tzinfo=None)


def test_consulta_revalida_mencoes_vencidas_sem_novo_login(
    client, turmas, database, qstash
):
    _login(client)
    _mencoes_sincronizadas_em(database, datetime.now(UTC) - timedelta(days=2))
    turmas.classrooms.list_grades.return_value = [
        ClassroomGrade(subject_code="FGA0158", semester="2025.2", grade=Grade.MM)
    ]
    turmas.classrooms.list_grades.reset_mock()

    response = client.get("/classrooms?semester=2025.2")

    assert response.status_code == 200
    assert response.json()[0]["grade"] is None
    assert client.get("/classrooms?semester=2025.2").json()[0]["grade"] == "MM"
    turmas.classrooms.list_grades.assert_awaited_once_with()
    assert qstash.jobs()[-1].steps[0].task == "sync_grades"


def test_mencao_nula_consultada_hoje_nao_cria_loop_de_jobs(client, turmas):
    _login(client)
    turmas.classrooms.list_grades.reset_mock()

    for _ in range(3):
        assert client.get("/classrooms?semester=2025.2").status_code == 200
        _login(client)

    turmas.classrooms.list_grades.assert_not_awaited()


def test_only_if_cached_devolve_mencoes_vencidas(client, turmas, database):
    _login(client)
    _mencoes_sincronizadas_em(database, datetime.now(UTC) - timedelta(days=2))
    turmas.classrooms.list_grades.reset_mock()

    response = client.get(
        "/classrooms?semester=all", headers={"Cache-Control": "only-if-cached"}
    )

    assert response.status_code == 200
    assert [row["grade"] for row in response.json()] == [None, None]
    turmas.classrooms.list_grades.assert_awaited_once_with()


@pytest.mark.parametrize("erro", [SigaaError("indisponível"), TimeoutError()])
def test_falha_em_refresh_nao_apaga_mencao_e_admite_cache_antigo(
    client, turmas, database, erro
):
    turmas.classrooms.list_grades.return_value = [
        ClassroomGrade(subject_code="FGA0146", semester="2026.2", grade=Grade.MS)
    ]
    _login(client)
    turmas.classrooms.list_grades.side_effect = erro

    assert (
        client.get("/classrooms", headers={"Cache-Control": "no-cache"}).status_code
        == 502
    )
    response = client.get(
        "/classrooms", headers={"Cache-Control": "no-cache, stale-if-error"}
    )
    assert response.status_code == 200
    assert response.json()[0]["grade"] == "MS"


def test_turma_nova_na_lista_revalida_as_mencoes(client, turmas, database):
    _login(client)
    turmas.classrooms.list_grades.reset_mock()
    nova = ATUAL.model_copy(update={"id": "CCC", "number": "02"})
    turmas.classrooms.list_classrooms.return_value = [
        *turmas.classrooms.list_classrooms.return_value,
        nova,
    ]

    client.get("/classrooms", headers={"Cache-Control": "no-cache"})
    _login(client)

    turmas.classrooms.list_grades.assert_awaited_once_with()


def test_relatorio_sem_mencao_consolidada_preserva_a_gravada(client, turmas, database):
    turmas.classrooms.list_grades.return_value = [
        ClassroomGrade(subject_code="FGA0158", semester="2025.2", grade=Grade.MS)
    ]
    _login(client)
    _mencoes_sincronizadas_em(database, datetime.now(UTC) - timedelta(days=2))
    turmas.classrooms.list_grades.return_value = []

    _login(client)

    assert turmas.classrooms.list_grades.await_count == 2
    assert {
        c["id"]: c["grade"] for c in client.get("/classrooms?semester=all").json()
    } == {"AAA": None, "BBB": "MS"}


@pytest.mark.parametrize("via_login", [False, True])
def test_historico_inteiro_sem_mencao_nao_congela(client, turmas, database, via_login):
    turmas.classrooms.list_classrooms.return_value = [ANTIGA]
    _login(client)
    _mencoes_sincronizadas_em(database, datetime.now(UTC) - timedelta(days=2))
    turmas.classrooms.list_grades.return_value = [
        ClassroomGrade(subject_code="FGA0158", semester="2025.2", grade=Grade.MS)
    ]
    turmas.classrooms.list_grades.reset_mock()

    if via_login:
        _login(client)
    else:
        assert client.get("/classrooms?semester=all").status_code == 200

    assert client.get("/classrooms?semester=all").json()[0]["grade"] == "MS"
    turmas.classrooms.list_grades.assert_awaited_once_with()


def test_historico_nulo_fresco_aceita_refresh_sem_loop(client, turmas):
    turmas.classrooms.list_classrooms.return_value = [ANTIGA]
    _login(client)
    turmas.classrooms.list_grades.reset_mock()
    for _ in range(3):
        assert client.get("/classrooms?semester=all").status_code == 200
        _login(client)
    turmas.classrooms.list_grades.assert_not_awaited()

    turmas.classrooms.list_grades.return_value = [
        ClassroomGrade(subject_code="FGA0158", semester="2025.2", grade=Grade.SS)
    ]
    response = client.get(
        "/classrooms?semester=all", headers={"Cache-Control": "no-cache"}
    )
    assert response.json()[0]["grade"] == "SS"
    turmas.classrooms.list_grades.assert_awaited_once_with()
