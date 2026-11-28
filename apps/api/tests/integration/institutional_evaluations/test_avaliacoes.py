from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from pydantic import SecretStr
from sigaa_client import (
    Credentials,
    InstitutionalEvaluation,
    InstitutionalEvaluationRejected,
    InstitutionalQuestionnaire,
)

PATH = "/me/institutional-evaluations"
ID = 7
EVALUATION = InstitutionalEvaluation(
    sigaa_id=ID,
    semester="2026.2",
    title="Avaliação da docência",
    respondent_profile="Discente de graduação",
    distance_learning=False,
    response_starts_on=date(2026, 11, 19),
    response_ends_on=date(2027, 1, 31),
)
QUESTIONNAIRE = InstitutionalQuestionnaire(
    evaluation=EVALUATION, instructions=None, targets=(), comments=()
)
CREDENTIALS = Credentials(registration="251000000", password=SecretStr("senha"))


@pytest.fixture
def evaluations(stub_sigaa):
    resource = SimpleNamespace(
        list_evaluations=AsyncMock(return_value=[EVALUATION]),
        get_questionnaire=AsyncMock(return_value=QUESTIONNAIRE),
        save_draft=AsyncMock(return_value=QUESTIONNAIRE),
        submit_evaluation=AsyncMock(return_value="Avaliação enviada com sucesso."),
    )
    stub_sigaa.institutional_evaluations = resource
    return resource


def test_consulta_avaliacoes_e_questionario_sem_cache(api, cookies, evaluations):
    api.cookies.update(cookies(access="app14~WEB", refresh=CREDENTIALS))
    listing = api.get(PATH)
    questionnaire = api.get(f"{PATH}/{ID}")
    assert listing.json() == [EVALUATION.model_dump(mode="json")]
    assert questionnaire.json() == QUESTIONNAIRE.model_dump(mode="json")
    assert all(
        response.status_code == 200 and response.headers["cache-control"] == "no-store"
        for response in (listing, questionnaire)
    )
    evaluations.get_questionnaire.assert_awaited_once_with(ID)


def test_salva_e_envia_em_sessoes_proprias_do_sigaa(
    api, cookies, evaluations, stub_sigaa
):
    api.cookies.update(cookies(access="app14~WEB", refresh=CREDENTIALS))
    draft = api.patch(f"{PATH}/{ID}/draft", json={"answers": {"p_1_1": None}})
    final = api.post(f"{PATH}/{ID}/submit", json={"answers": {"p_1_1": "9"}})
    assert draft.json() == QUESTIONNAIRE.model_dump(mode="json")
    assert final.json() == {"confirmation": "Avaliação enviada com sucesso."}
    assert all(
        response.status_code == 200 and response.headers["cache-control"] == "no-store"
        for response in (draft, final)
    )
    evaluations.save_draft.assert_awaited_once_with(ID, {"p_1_1": None})
    evaluations.submit_evaluation.assert_awaited_once_with(ID, {"p_1_1": "9"})
    assert [
        call.kwargs["session_token"] for call in stub_sigaa.created.call_args_list
    ] == [None, None]
    assert stub_sigaa.logout.await_count == 2


def test_envio_exige_login_e_valida_respostas_antes_do_sigaa(api, cookies, evaluations):
    path = f"{PATH}/{ID}/submit"
    assert api.post(path, json={}).status_code == 401
    api.cookies.update(cookies(refresh=CREDENTIALS))
    assert api.post(path, json={"answers": {"p_1_1": 10}}).status_code == 422
    evaluations.submit_evaluation.assert_not_awaited()


def test_mostra_motivo_da_recusa_ao_enviar(api, cookies, evaluations):
    api.cookies.update(cookies(refresh=CREDENTIALS))
    evaluations.submit_evaluation.side_effect = InstitutionalEvaluationRejected(
        "Há perguntas obrigatórias sem resposta."
    )
    response = api.post(f"{PATH}/{ID}/submit", json={})
    assert response.status_code == 422
    assert response.json() == {"detail": "Há perguntas obrigatórias sem resposta."}
