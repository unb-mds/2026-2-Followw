import pytest

from .helpers import PATH, PLAN


def _classroom(logged) -> dict:
    [classroom] = logged.get("/classrooms").json()
    return classroom


def test_turma_sem_plano_lido_nao_informa_se_tem_plano(logged):
    assert _classroom(logged)["has_teaching_plan"] is None


@pytest.mark.parametrize("plan,expected", [(PLAN, True), (None, False)])
def test_listagem_informa_se_a_turma_tem_plano(logged, teaching_sigaa, plan, expected):
    teaching_sigaa.classrooms.get_classroom_teaching_plan.return_value = plan
    assert logged.get(PATH).status_code == 200
    assert _classroom(logged)["has_teaching_plan"] is expected
