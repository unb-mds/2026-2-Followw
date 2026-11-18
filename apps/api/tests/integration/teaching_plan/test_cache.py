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


@pytest.mark.parametrize("plan", [PLAN, None])
def test_plano_ou_ausencia_nunca_revalida(
    logged, teaching_sigaa, database, qstash, plan
):
    fetch = teaching_sigaa.classrooms.get_classroom_teaching_plan
    fetch.return_value = plan
    first = logged.get(PATH)
    with database() as session:
        classroom = session.scalar(select(Classroom))
        classroom.teaching_plan_synced_at = datetime.now(UTC) - timedelta(days=365)
        session.commit()
    fetch.return_value = PLAN.model_copy(update={"office_hours": "Às terças."})
    for headers in ({}, {"Cache-Control": "no-cache"}, {"Cache-Control": "max-age=0"}):
        response = logged.get(PATH, headers=headers)
        assert response.status_code == 200
        assert response.json() == first.json()
    fetch.assert_awaited_once()
    assert qstash.published == []


def test_falha_na_primeira_leitura_nao_grava_cache(logged, teaching_sigaa):
    fetch = teaching_sigaa.classrooms.get_classroom_teaching_plan
    fetch.side_effect = SigaaParseError("Layout mudou")
    assert logged.get(PATH).status_code == 502
    fetch.side_effect = None
    response = logged.get(PATH)
    assert response.status_code == 200
    assert response.json() == PLAN.model_dump(mode="json")
    assert fetch.await_count == 2


def test_somente_cache_sem_plano_consultado_retorna_504(logged, teaching_sigaa):
    assert logged.get("/classrooms").status_code == 200
    assert (
        logged.get(PATH, headers={"Cache-Control": "only-if-cached"}).status_code == 504
    )
    teaching_sigaa.classrooms.get_classroom_teaching_plan.assert_not_awaited()
