import pytest
from sigaa_client import SigaaParseError

from .helpers import PATH, PLAN


@pytest.mark.parametrize("by_id", [True, False])
def test_consulta_plano_pelos_dois_identificadores(
    logged, teaching_sigaa, id_da_turma, by_id
):
    logged.get("/classrooms")
    path = f"/classrooms/{id_da_turma('AAA')}/teaching-plan" if by_id else PATH
    response = logged.get(path)
    assert response.status_code == 200
    assert response.json() == PLAN.model_dump(mode="json")
    assert response.json()["schedule"][0]["start_date"] == "2026-08-11"
    teaching_sigaa.classrooms.get_classroom_teaching_plan.assert_awaited_once_with(
        "AAA"
    )


def test_plano_ausente_retorna_200_com_null(logged, teaching_sigaa):
    teaching_sigaa.classrooms.get_classroom_teaching_plan.return_value = None
    response = logged.get(PATH)
    assert response.status_code == 200
    assert response.json() is None


def test_plano_exige_autenticacao(api):
    assert api.get(PATH).status_code == 401


def test_turma_alheia_retorna_404(logged, teaching_sigaa):
    assert logged.get("/classrooms/ALHEIA/teaching-plan").status_code == 404
    teaching_sigaa.classrooms.get_classroom_teaching_plan.assert_not_awaited()


def test_cache_nao_libera_acesso_a_turma_que_saiu_da_conta(logged, teaching_sigaa):
    assert logged.get(PATH).status_code == 200
    teaching_sigaa.classrooms.list_classrooms.return_value = []
    assert (
        logged.get("/classrooms", headers={"Cache-Control": "no-cache"}).status_code
        == 200
    )
    assert logged.get(PATH).status_code == 404
    teaching_sigaa.classrooms.get_classroom_teaching_plan.assert_awaited_once()


def test_erro_de_parsing_e_propagado_como_502(logged, teaching_sigaa):
    teaching_sigaa.classrooms.get_classroom_teaching_plan.side_effect = SigaaParseError(
        "Layout mudou"
    )
    assert logged.get(PATH).status_code == 502


def test_openapi_documenta_plano_opcional_e_erros(api):
    spec = api.get("/openapi.json").json()
    responses = spec["paths"]["/classrooms/{classroom_id}/teaching-plan"]["get"][
        "responses"
    ]
    assert responses["200"]["content"]["application/json"]["schema"]["anyOf"] == [
        {"$ref": "#/components/schemas/ClassroomTeachingPlan"},
        {"type": "null"},
    ]
    assert {"401", "404", "502", "503", "504"} <= responses.keys()
