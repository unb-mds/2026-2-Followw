from pathlib import Path
from unittest.mock import AsyncMock

import httpx
import pytest
from bs4 import BeautifulSoup

from sigaa_client import SessionRenewed, SigaaClient, SigaaParseError
from sigaa_client.config import DASHBOARD_PATH
from sigaa_client.private.documents import (
    _ENROLLMENT_CERTIFICATE_MENU_ACTION,
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
ATTESTATION = """
<html><head><title>Atestado de Matrícula</title></head><body>
<div id="relatorio-container"><div id="relatorio">
  <h3>Atestado de Matrícula</h3>
  <div id="identificacao">DISCENTE DE TESTE - 251000000</div>
  <table id="matriculas"><tr><th>Componente</th><th>Status</th></tr>
    <tr><td>DISCIPLINA DE TESTE</td><td>MATRICULADO(A)</td></tr></table>
  <div id="autenticacao">Código de verificação: TESTE123</div>
</div></div></body></html>
"""
PDF_DOCUMENTS = [
    ("get_student_card_pdf", _STUDENT_CARD_MENU_ACTION),
    ("get_transcript_pdf", _TRANSCRIPT_MENU_ACTION),
]
DOCUMENTS = PDF_DOCUMENTS + [
    ("get_enrollment_certificate_html", _ENROLLMENT_CERTIFICATE_MENU_ACTION)
]


def _content(method):
    return (
        ATTESTATION.encode("utf-8")
        if method == "get_enrollment_certificate_html"
        else CARTEIRINHA_PDF
    )


def _assert_document(result, method):
    if method == "get_enrollment_certificate_html":
        assert "TESTE123" in result
        assert "Atestado de Matrícula" in result
    else:
        assert result == CARTEIRINHA_PDF


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
        return httpx.Response(200, content=_content(method))

    async with SigaaClient(
        session_token="tok", transport=httpx.MockTransport(handle)
    ) as client:
        for viewstate in ("VS1", "VS2"):
            _assert_document(await getattr(client.documents, method)(), method)
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
        httpx.Response(200, content=_content(method)),
    ]
    documents = Documents(session)
    _assert_document(await getattr(documents, method)(), method)
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


@pytest.mark.parametrize("encoding", ["utf-8", "iso-8859-1"])
async def test_atestado_exporta_html_com_codigo_de_verificacao_e_base(encoding):
    session = AsyncMock()
    session.get.return_value = httpx.Response(200, text=MENU)
    source = ATTESTATION.replace(
        "</head>",
        '<meta charset="iso-8859-1"><meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1"><base href="https://example.org/"></head>',
    )
    source = source.replace(
        '<meta charset="iso-8859-1">', f'<meta charset="{encoding}">'
    )
    session.post.return_value = httpx.Response(200, content=source.encode(encoding))
    result = await Documents(session).get_enrollment_certificate_html()
    html = BeautifulSoup(result, "lxml")
    assert "Atestado de Matrícula" in html.get_text()
    assert "TESTE123" in html.get_text()
    assert "MATRICULADO(A)" in html.get_text()
    assert len(html.find_all("base")) == 1
    assert html.base["href"].endswith(DASHBOARD_PATH)
    assert html.meta["charset"] == "utf-8"
    assert "iso-8859-1" not in result
    assert session.get.await_count == 1
    assert (
        session.post.call_args.kwargs["data"]["jscook_action"]
        == _ENROLLMENT_CERTIFICATE_MENU_ACTION
    )
