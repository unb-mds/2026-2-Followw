from datetime import date
from unittest.mock import AsyncMock

import httpx
import pytest

from sigaa_client import (
    InstitutionalEvaluation,
    SessionRenewed,
    SigaaClient,
    SigaaParseError,
)
from sigaa_client.config import DASHBOARD_PATH
from sigaa_client.private.institutional_evaluation import InstitutionalEvaluations

from .fakes import LINHA, LISTAGEM, MENU


async def test_lista_avaliacoes_pelo_menu_do_discente():
    requests = []

    def handle(request):
        requests.append(request.method)
        assert request.url.path == DASHBOARD_PATH
        if request.method == "GET":
            return httpx.Response(200, text=MENU)
        assert dict(httpx.QueryParams(request.content.decode())) == {
            "menu:form_menu_discente": "menu:form_menu_discente",
            "id": "",
            "jscook_action": (
                "menu_form_menu_discente_discente_menu:A]"
                "#{ calendarioAvaliacaoInstitucionalBean.listar }"
            ),
            "javax.faces.ViewState": "VS1",
        }
        return httpx.Response(200, text=LISTAGEM.format(rows=LINHA))

    async with SigaaClient(
        session_token="tok", transport=httpx.MockTransport(handle)
    ) as client:
        assert await client.institutional_evaluations.list_evaluations() == [
            InstitutionalEvaluation(
                sigaa_id=123,
                semester="2026.2",
                title="AVALIAÇÃO DOCENTE PELO DISCENTE",
                respondent_profile="DISCENTE DE GRADUAÇÃO",
                distance_learning=False,
                response_starts_on=date(2026, 11, 19),
                response_ends_on=date(2027, 1, 31),
            )
        ]
    assert requests == ["GET", "POST"]


async def test_listagem_vazia_apos_renovacao_rele_o_viewstate():
    session = AsyncMock()
    session.get.side_effect = [
        httpx.Response(200, text=MENU),
        httpx.Response(200, text=MENU.replace("VS1", "VS2")),
    ]
    session.post.side_effect = [
        SessionRenewed(),
        httpx.Response(200, text=LISTAGEM.format(rows="")),
    ]

    assert await InstitutionalEvaluations(session).list_evaluations() == []
    assert session.get.await_count == 2
    assert [
        (call.kwargs["data"]["javax.faces.ViewState"], call.kwargs["allow_renewal"])
        for call in session.post.await_args_list
    ] == [("VS1", True), ("VS2", False)]


@pytest.mark.parametrize(
    "html",
    [
        "<h2>Portal Discente</h2>",
        LISTAGEM.format(rows="").replace("Perfil Entrevistado", "Outro"),
        LISTAGEM.format(rows=LINHA.replace("31/01/2027", "31/02/2027")),
    ],
)
async def test_listagem_com_layout_ou_dados_invalidos_gera_erro(html):
    session = AsyncMock()
    session.get.return_value = httpx.Response(200, text=MENU)
    session.post.return_value = httpx.Response(200, text=html)

    with pytest.raises(SigaaParseError, match="avaliaç"):
        await InstitutionalEvaluations(session).list_evaluations()
