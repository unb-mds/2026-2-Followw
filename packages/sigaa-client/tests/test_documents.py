from pathlib import Path
from unittest.mock import AsyncMock

import httpx
import pytest

from sigaa_client import SessionRenewed, SigaaClient, SigaaParseError
from sigaa_client.config import DASHBOARD_PATH
from sigaa_client.private.documents import (
    _STUDENT_CARD_MENU_ACTION,
    _TRANSCRIPT_MENU_ACTION,
    Documents,
)

CARTEIRINHA_PDF = (Path(__file__).parent / "fixtures" / "carteirinha.pdf").read_bytes()
MENU = """
<form id="menu:form_menu_discente" name="menu:form_menu_discente"
      action="/sigaa/portais/discente/discente.jsf">
  <input type="hidden" name="menu:form_menu_discente" value="menu:form_menu_discente">
  <input type="hidden" name="jscook_action">
  <input type="hidden" name="javax.faces.ViewState" value="VS1">
</form>
"""
DOCUMENTS = [
    ("get_student_card_pdf", _STUDENT_CARD_MENU_ACTION),
    ("get_transcript_pdf", _TRANSCRIPT_MENU_ACTION),
]


@pytest.mark.parametrize("method,menu_action", DOCUMENTS)
async def test_download_retorna_documento_e_rele_viewstate(method, menu_action):
    methods = []
    viewstate = "VS1"

    def handle(request):
        methods.append(request.method)
        assert request.url.path == DASHBOARD_PATH
        if request.method == "GET":
            return httpx.Response(200, text=MENU.replace("VS1", viewstate))
        payload = dict(httpx.QueryParams(request.content.decode()))
        assert payload["javax.faces.ViewState"] == viewstate
        assert payload["jscook_action"] == menu_action
        return httpx.Response(200, content=CARTEIRINHA_PDF)

    async with SigaaClient(
        session_token="tok", transport=httpx.MockTransport(handle)
    ) as client:
        for viewstate in ("VS1", "VS2"):
            assert await getattr(client.documents, method)() == CARTEIRINHA_PDF
    assert methods == ["GET", "POST", "GET", "POST"]


@pytest.mark.parametrize("content", [b"<html>Erro do SIGAA</html>", b""])
@pytest.mark.parametrize("method,menu_action", DOCUMENTS)
async def test_download_rejeita_resposta_invalida(content, method, menu_action):
    def handle(request):
        if request.method == "GET":
            return httpx.Response(200, text=MENU)
        return httpx.Response(200, content=content)

    async with SigaaClient(
        session_token="tok", transport=httpx.MockTransport(handle)
    ) as client:
        with pytest.raises(SigaaParseError):
            await getattr(client.documents, method)()


@pytest.mark.parametrize("method,menu_action", DOCUMENTS)
async def test_download_sem_menu_nao_faz_postback(method, menu_action):
    methods = []

    def handle(request):
        methods.append(request.method)
        return httpx.Response(200, text="<html></html>")

    async with SigaaClient(
        session_token="tok", transport=httpx.MockTransport(handle)
    ) as client:
        with pytest.raises(SigaaParseError, match="Menu do discente"):
            await getattr(client.documents, method)()
    assert methods == ["GET"]


@pytest.mark.parametrize("method,menu_action", DOCUMENTS)
async def test_documento_reabre_portal_apos_renovacao_da_sessao(method, menu_action):
    session = AsyncMock()
    session.get.side_effect = [
        httpx.Response(200, text=MENU),
        httpx.Response(200, text=MENU.replace("VS1", "VS2")),
    ]
    session.post.side_effect = [
        SessionRenewed(),
        httpx.Response(200, content=CARTEIRINHA_PDF),
    ]
    documents = Documents(session)
    assert await getattr(documents, method)() == CARTEIRINHA_PDF
    assert session.get.await_count == 2
    assert [
        call.kwargs["data"]["javax.faces.ViewState"]
        for call in session.post.await_args_list
    ] == ["VS1", "VS2"]
    assert all(
        call.kwargs["data"]["jscook_action"] == menu_action
        for call in session.post.await_args_list
    )


async def test_documento_limita_retentativa_apos_renovacao():
    session = AsyncMock()
    session.get.return_value = httpx.Response(200, text=MENU)
    session.post.side_effect = SessionRenewed()
    with pytest.raises(SessionRenewed):
        await Documents(session).get_transcript_pdf()
    assert session.post.await_count == 2


async def test_documento_sem_viewstate_nao_envia_postback():
    session = AsyncMock()
    session.get.return_value = httpx.Response(
        200, text=MENU.replace('value="VS1"', 'value=""')
    )
    with pytest.raises(SigaaParseError, match="ViewState"):
        await Documents(session).get_transcript_pdf()
    session.post.assert_not_awaited()
