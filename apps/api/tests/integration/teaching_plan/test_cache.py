from datetime import UTC, datetime, timedelta

import pytest
from sigaa_client import SigaaParseError
from sqlalchemy import select

from api.db.models import Classroom

from .helpers import PATH, PLAN


@pytest.mark.parametrize("plan", [PLAN, None])
def test_cache_de_plano_ou_ausencia_e_compartilhado_pelos_identificadores(
    logged, teaching_sigaa, qstash, plan
):
    teaching_sigaa.classrooms.get_classroom_teaching_plan.return_value = plan
    first = logged.get(PATH)
    assert first.status_code == 200
    teaching_sigaa.created.reset_mock()
    response = logged.get("/classrooms/123/teaching-plan")
    assert response.status_code == 200
    assert response.json() == first.json()
    assert response.headers["cache-control"] == "private, no-cache"
    assert "age" in response.headers
    teaching_sigaa.classrooms.get_classroom_teaching_plan.assert_awaited_once()
    teaching_sigaa.created.assert_not_called()
    assert qstash.published == []


@pytest.mark.parametrize("before,after", [(None, PLAN), (PLAN, None)])
def test_cache_vencido_retorna_anterior_e_revalida_pela_fila(
    logged, teaching_sigaa, database, qstash, before, after
):
    fetch = teaching_sigaa.classrooms.get_classroom_teaching_plan
    fetch.return_value = before
    first = logged.get(PATH)
    with database() as session:
        classroom = session.scalar(select(Classroom))
        classroom.teaching_plan_synced_at = datetime.now(UTC) - timedelta(hours=25)
        session.commit()
    fetch.return_value = after
    stale = logged.get(PATH)
    assert stale.status_code == 200
    assert stale.json() == first.json()
    assert int(stale.headers["age"]) >= 25 * 3600
    assert len(qstash.published) == 1
    assert qstash.deliveries[0].status_code == 204
    assert qstash.jobs()[0].steps[0].task == "sync_teaching_plan"
    fresh = logged.get(PATH)
    assert fresh.status_code == 200
    assert fresh.json() == (after.model_dump(mode="json") if after else None)
    assert fetch.await_count == 2


def test_cache_atual_vale_24_horas(logged, teaching_sigaa, database, qstash):
    assert logged.get(PATH).status_code == 200
    with database() as session:
        classroom = session.scalar(select(Classroom))
        classroom.teaching_plan_synced_at = datetime.now(UTC) - timedelta(hours=23)
        session.commit()
    assert logged.get(PATH).status_code == 200
    teaching_sigaa.classrooms.get_classroom_teaching_plan.assert_awaited_once()
    assert qstash.published == []


@pytest.mark.parametrize("plan", [PLAN, None])
def test_historico_nao_expira_mas_aceita_atualizacao_forcada(
    logged, teaching_sigaa, database, qstash, plan
):
    teaching_sigaa.classrooms.list_classrooms.return_value = [
        teaching_sigaa.classrooms.list_classrooms.return_value[0].model_copy(
            update={"current": False}
        )
    ]
    fetch = teaching_sigaa.classrooms.get_classroom_teaching_plan
    fetch.return_value = plan
    first = logged.get(PATH)
    with database() as session:
        classroom = session.scalar(select(Classroom))
        classroom.teaching_plan_synced_at = datetime.now(UTC) - timedelta(days=365)
        session.commit()
    assert logged.get(PATH).json() == first.json()
    fetch.assert_awaited_once()
    assert qstash.published == []
    fetch.return_value = PLAN.model_copy(update={"office_hours": "Às terças."})
    response = logged.get(PATH, headers={"Cache-Control": "no-cache"})
    assert response.status_code == 200
    assert response.json()["office_hours"] == "Às terças."
    assert fetch.await_count == 2


@pytest.mark.parametrize("plan", [PLAN, None])
def test_falha_na_atualizacao_preserva_cache(logged, teaching_sigaa, plan):
    fetch = teaching_sigaa.classrooms.get_classroom_teaching_plan
    fetch.return_value = plan
    first = logged.get(PATH)
    fetch.side_effect = SigaaParseError("Layout mudou")
    assert logged.get(PATH, headers={"Cache-Control": "no-cache"}).status_code == 502
    response = logged.get(PATH)
    assert response.status_code == 200
    assert response.json() == first.json()


def test_somente_cache_sem_plano_consultado_retorna_504(logged, teaching_sigaa):
    assert logged.get("/classrooms").status_code == 200
    assert (
        logged.get(PATH, headers={"Cache-Control": "only-if-cached"}).status_code == 504
    )
    teaching_sigaa.classrooms.get_classroom_teaching_plan.assert_not_awaited()
