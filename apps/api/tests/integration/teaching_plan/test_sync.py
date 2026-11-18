from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import update

from api.db.models import User

from .helpers import LOGIN, PLAN


def _passada(teaching_sigaa):
    [classroom] = teaching_sigaa.classrooms.list_classrooms.return_value
    teaching_sigaa.classrooms.list_classrooms.return_value = [
        classroom.model_copy(update={"current": False})
    ]


def test_login_le_o_plano_da_turma_atual_no_job_dela(client, teaching_sigaa, qstash):
    assert client.post("/auth/sigaa", json=LOGIN).status_code == 200
    jobs = {
        job.classroom_id: [step.task for step in job.steps] for job in qstash.jobs()
    }
    assert "sync_teaching_plan" in jobs["AAA"]
    teaching_sigaa.classrooms.get_classroom_teaching_plan.assert_awaited_once_with(
        "AAA"
    )


def test_login_nao_le_plano_de_turma_passada(client, teaching_sigaa):
    _passada(teaching_sigaa)
    assert client.post("/auth/sigaa", json=LOGIN).status_code == 200
    teaching_sigaa.classrooms.get_classroom_teaching_plan.assert_not_awaited()


@pytest.mark.parametrize("plan", [PLAN, None])
def test_novo_login_nao_le_o_plano_de_novo(client, teaching_sigaa, database, plan):
    teaching_sigaa.classrooms.get_classroom_teaching_plan.return_value = plan
    client.post("/auth/sigaa", json=LOGIN)
    with database() as session:
        vencido = datetime.now(UTC) - timedelta(hours=73)
        session.execute(update(User).values(classrooms_synced_at=vencido))
        session.commit()
    client.post("/auth/sigaa", json=LOGIN)
    assert teaching_sigaa.classrooms.list_classrooms.await_count == 2
    teaching_sigaa.classrooms.get_classroom_teaching_plan.assert_awaited_once()
