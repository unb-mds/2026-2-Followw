from datetime import UTC, datetime, timedelta

from sigaa_client import ClassroomGrade, Grade, SigaaError

from .helpers import (
    ANTIGA,
    ATUAL,
    NO_CACHE,
    _login,
    _mencoes_sincronizadas,
    _mencoes_sincronizadas_em,
)


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


def test_mencoes_vencidas_revalidam_no_login(client, sigaa, turmas, database):
    _login(client)
    vencida = datetime.now(UTC) - timedelta(days=2)
    _mencoes_sincronizadas_em(database, vencida)
    turmas.classrooms.list_grades.reset_mock()

    _login(client)

    turmas.classrooms.list_grades.assert_awaited_once_with()
    assert _mencoes_sincronizadas(database) > vencida


def test_turma_nova_na_lista_revalida_as_mencoes(client, turmas, database):
    _login(client)
    turmas.classrooms.list_grades.reset_mock()
    nova = ATUAL.model_copy(update={"id": "CCC", "number": "02"})
    turmas.classrooms.list_classrooms.return_value = [
        *turmas.classrooms.list_classrooms.return_value,
        nova,
    ]

    client.get("/classrooms", headers=NO_CACHE)
    _login(client)

    turmas.classrooms.list_grades.assert_awaited_once_with()


def test_mencao_nula_de_semestre_consolidado_continua_revalidando(
    client, turmas, database
):
    turmas.classrooms.list_classrooms.return_value = [ANTIGA]
    _login(client)
    _mencoes_sincronizadas_em(database, datetime.now(UTC) - timedelta(days=2))
    turmas.classrooms.list_grades.return_value = [
        ClassroomGrade(subject_code="FGA0158", semester="2025.2", grade=Grade.MS)
    ]

    _login(client)

    assert client.get("/classrooms?semester=all").json()[0]["grade"] == "MS"


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


def test_resultado_vazio_no_relatorio_limpa_a_mencao(client, turmas, database):
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


def test_disciplina_ausente_do_relatorio_preserva_a_mencao(client, turmas, database):
    turmas.classrooms.list_grades.return_value = [
        ClassroomGrade(subject_code="FGA0146", semester="2026.2", grade=Grade.MS),
        ClassroomGrade(subject_code="FGA0158", semester="2025.2", grade=Grade.SS),
    ]
    _login(client)
    _mencoes_sincronizadas_em(database, datetime.now(UTC) - timedelta(days=2))
    turmas.classrooms.list_grades.return_value = []

    _login(client)

    assert turmas.classrooms.list_grades.await_count == 2
    assert {
        c["id"]: c["grade"] for c in client.get("/classrooms?semester=all").json()
    } == {"AAA": "MS", "BBB": "SS"}


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
    assert turmas.classrooms.list_grades.await_count == 2
    assert _mencoes_sincronizadas(database) == synced_at
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
