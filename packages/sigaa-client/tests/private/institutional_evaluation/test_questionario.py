from unittest.mock import AsyncMock

import httpx
import pytest

from sigaa_client import (
    InstitutionalEvaluationNotFound,
    SessionRenewed,
    SigaaClient,
    SigaaParseError,
)
from sigaa_client.config import DASHBOARD_PATH
from sigaa_client.private.institutional_evaluation import InstitutionalEvaluations

from .fakes import INTRO, LINHA, LISTAGEM, MENU, QUESTIONARIO


async def test_ler_questionario_associa_perguntas_as_turmas_e_docentes():
    requests = []

    def handle(request):
        requests.append((request.method, request.url.path))
        if request.method == "GET":
            return httpx.Response(200, text=MENU)
        payload = dict(httpx.QueryParams(request.content.decode()))
        match request.url.path:
            case "/sigaa/avaliacao/calendario/lista.jsf":
                assert payload == {
                    "form": "form",
                    "form:responder": "form:responder",
                    "id": "123",
                    "javax.faces.ViewState": "VS-lista",
                }
                return httpx.Response(200, text=INTRO)
            case "/sigaa/avaliacao/introDiscente.jsf":
                assert payload == {
                    "intro": "intro",
                    "intro:abrir": "intro:abrir",
                    "javax.faces.ViewState": "VS-intro",
                }
                return httpx.Response(200, text=QUESTIONARIO)
            case _:
                return httpx.Response(200, text=LISTAGEM.format(rows=LINHA))

    async with SigaaClient(
        session_token="tok", transport=httpx.MockTransport(handle)
    ) as client:
        questionnaire = await client.institutional_evaluations.get_questionnaire(123)

    assert requests == [
        ("GET", DASHBOARD_PATH),
        ("POST", DASHBOARD_PATH),
        ("POST", "/sigaa/avaliacao/calendario/lista.jsf"),
        ("POST", "/sigaa/avaliacao/introDiscente.jsf"),
    ]
    assert questionnaire.instructions == "Avalie a docência."
    assert questionnaire.evaluation.sigaa_id == 123
    assert [
        (target.classroom_sigaa_id, target.classroom_label, target.instructor)
        for target in questionnaire.targets
    ] == [
        (10, "FGA0001 - T01", "Ana"),
        (20, "FGA0002 - COMPONENTE", "Bia"),
        (20, "FGA0002 - COMPONENTE", "Carlos"),
    ]
    assert [target.questions[0].options for target in questionnaire.targets] == [
        ("10", "N/A"),
        ("9", "N/A"),
        ("10", "N/A"),
    ]
    assert (
        questionnaire.targets[0].questions[0].prompt
        == "O plano de ensino foi apresentado."
    )
    assert questionnaire.comments[0].instructor_options == ("Nenhum", "Bia", "Carlos")
    assert questionnaire.comments[1].label == "Comentários gerais"
    assert questionnaire.comments[0].text == "Texto de rascunho"
    assert questionnaire.comments[0].instructor_answer == "20"
    assert questionnaire.targets[0].questions[0].answer == "10"
    assert questionnaire.targets[2].questions[0].answer is None


async def test_avaliacao_fora_da_listagem_nao_abre_questionario():
    session = AsyncMock()
    session.get.return_value = httpx.Response(200, text=MENU)
    session.post.return_value = httpx.Response(200, text=LISTAGEM.format(rows=LINHA))

    with pytest.raises(InstitutionalEvaluationNotFound):
        await InstitutionalEvaluations(session).get_questionnaire(456)

    assert session.post.await_count == 1


async def test_questionario_reabre_desde_o_portal_apos_renovacao():
    session = AsyncMock()
    session.get.side_effect = [
        httpx.Response(200, text=MENU),
        httpx.Response(200, text=MENU.replace("VS1", "VS2")),
    ]
    listing = LISTAGEM.format(rows=LINHA)
    session.post.side_effect = [
        httpx.Response(200, text=listing),
        httpx.Response(200, text=INTRO),
        SessionRenewed(),
        httpx.Response(200, text=listing.replace("VS-lista", "VS-lista-2")),
        httpx.Response(200, text=INTRO.replace("VS-intro", "VS-intro-2")),
        httpx.Response(200, text=QUESTIONARIO),
    ]

    assert (await InstitutionalEvaluations(session).get_questionnaire(123)).targets
    assert [
        call.kwargs["data"]["javax.faces.ViewState"]
        for call in session.post.await_args_list
    ] == ["VS1", "VS-lista", "VS-intro", "VS2", "VS-lista-2", "VS-intro-2"]
    assert [call.kwargs["allow_renewal"] for call in session.post.await_args_list] == [
        True,
        True,
        True,
        False,
        False,
        False,
    ]


async def test_questionario_com_coluna_sem_turma_gera_erro():
    session = AsyncMock()
    session.get.return_value = httpx.Response(200, text=MENU)
    session.post.side_effect = [
        httpx.Response(200, text=LISTAGEM.format(rows=LINHA)),
        httpx.Response(200, text=INTRO),
        httpx.Response(
            200,
            text=QUESTIONARIO.replace(
                '<acronym title="456 - Bia">Bia</acronym>', "Bia"
            ),
        ),
    ]

    with pytest.raises(SigaaParseError, match="Campo de resposta sem turma"):
        await InstitutionalEvaluations(session).get_questionnaire(123)
