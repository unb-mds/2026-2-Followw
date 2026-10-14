from io import BytesIO
from pathlib import Path
from unittest.mock import AsyncMock

import httpx
import pytest
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright
from pypdf import PdfReader

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
  <div id="identificacao">DISCENTE DE TESTE — 251000000</div>
  <table id="matriculas"><tr><th>Componente</th><th>Status</th></tr>
    <tr><td>DISCIPLINA DE TESTE</td><td>MATRICULADO(A)</td></tr></table>
  <div id="autenticacao">Código de verificação: TESTE123</div>
</div></div></body></html>
"""
DOCUMENTS = [
    ("get_student_card_pdf", _STUDENT_CARD_MENU_ACTION),
    ("get_transcript_pdf", _TRANSCRIPT_MENU_ACTION),
    ("get_enrollment_certificate_pdf", _ENROLLMENT_CERTIFICATE_MENU_ACTION),
]


@pytest.mark.parametrize("method,menu_action", DOCUMENTS)
async def test_download_retorna_pdf_original_e_rele_viewstate(method, menu_action):
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
async def test_download_rejeita_resposta_sem_pdf(content, method, menu_action):
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


async def test_atestado_converte_html_original_com_codigo_de_verificacao(monkeypatch):
    session = AsyncMock()
    session.get.return_value = httpx.Response(200, text=MENU)
    session.post.return_value = httpx.Response(200, text=ATTESTATION)
    render = AsyncMock(return_value=CARTEIRINHA_PDF)
    monkeypatch.setattr(Documents, "_print_pdf", render)
    assert await Documents(session).get_enrollment_certificate_pdf() == CARTEIRINHA_PDF
    html = BeautifulSoup(render.call_args.args[0], "lxml")
    assert "TESTE123" in html.get_text()
    assert "MATRICULADO(A)" in html.get_text()
    assert html.base["href"].endswith(DASHBOARD_PATH)
    assert (
        session.post.call_args.kwargs["data"]["jscook_action"]
        == _ENROLLMENT_CERTIFICATE_MENU_ACTION
    )


async def test_atestado_renderiza_pdf_com_estilos_pela_sessao_e_bloqueia_rede_externa():
    async with async_playwright() as playwright:
        if not Path(playwright.chromium.executable_path).exists():
            pytest.skip("Instale Chromium com `uv run playwright install chromium`.")
    requests = []
    html = ATTESTATION.replace(
        "</head>",
        """
      <link rel="stylesheet" href="/shared/css/ufrn_print.css" media="print">
      <script src="/shared/jsBundles/jawr_loader.js"></script>
      <link rel="stylesheet" href="https://example.org/external.css">
      <img src="/sigaa/logar.do?dispatch=logOff">
    </head>""",
    )

    def handle(request):
        requests.append(request)
        if request.method == "POST":
            return httpx.Response(200, text=html)
        if request.url.path == "/shared/css/ufrn_print.css":
            return httpx.Response(
                200,
                text="body {font-family: Arial; font-size: 12px}",
                headers={"content-type": "text/css"},
            )
        if request.url.path == "/shared/jsBundles/jawr_loader.js":
            return httpx.Response(
                200,
                text="document.body.dataset.stylesLoaded = 'yes';",
                headers={"content-type": "application/javascript"},
            )
        assert request.url.path == DASHBOARD_PATH
        return httpx.Response(200, text=MENU)

    async with SigaaClient(
        session_token="tok", transport=httpx.MockTransport(handle)
    ) as client:
        pdf = await client.documents.get_enrollment_certificate_pdf()
    reader = PdfReader(BytesIO(pdf))
    text = "\n".join(page.extract_text() for page in reader.pages)
    assert "Atestado de Matrícula" in text
    assert "TESTE123" in text
    assert "DISCIPLINA DE TESTE" in text
    assert float(reader.pages[0].mediabox.width) == pytest.approx(595, abs=1)
    assert [request.url.path for request in requests[:2]] == [
        DASHBOARD_PATH,
        DASHBOARD_PATH,
    ]
    assert {request.url.path for request in requests[2:]} == {
        "/shared/css/ufrn_print.css",
        "/shared/jsBundles/jawr_loader.js",
    }
