from pathlib import Path
from unittest.mock import AsyncMock

import httpx
import pytest

from sigaa_client import (
    DocumentUnavailable,
    MissingProfilePhoto,
    SessionExpired,
    SessionRenewed,
    SigaaClient,
    SigaaParseError,
)
from sigaa_client.config import DASHBOARD_PATH
from sigaa_client.private.documents import (
    _ENROLLMENT_MENU_ACTION,
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
ALL_DOCUMENTS = [*DOCUMENTS, ("get_enrollment_certificate", _ENROLLMENT_MENU_ACTION)]
CERTIFICATE = """
<div id="relatorio-cabecalho"><div id="texto">Universidade de Brasília<br>
Sistema Integrado de Gestão de Atividades Acadêmicas<br>
<span class="dataAtual">Emitido em 20/10/2026 21:52</span></div></div>
<div id="relatorio">
<h3>Atestado de Matrícula</h3>
<table id="identificacao">
<tr><td>Período\n Letivo:</td><td>2026.2 (10/08/2026 à 14/12/2026)</td>
<td>Nível:</td><td>GRADUAÇÃO</td></tr>
<tr><td>Matrícula:</td><td>251000000</td><td>Vínculo:</td><td>REGULAR</td></tr>
<tr><td>Nome:</td><td colspan="3">JOÃO DA CONCEIÇÃO</td></tr>
<tr><td>Curso:</td><td colspan="3">ENGENHARIA DE SOFTWARE - DIURNO</td></tr>
</table>
<h4>Turmas Matriculadas: 2</h4>
<table id="matriculas"><thead><tr><th>Cód.</th><th>Componentes Curriculares/Docentes</th>
<th>Turma</th><th>Status</th><th>Horário</th></tr></thead><tbody>
<tr><td class="codigo">MAT0027</td><td><span class="componente">CÁLCULO 3</span>
<span class="docente">DOCENTE DE TESTE</span><span class="tipoComponente">Tipo: DISCIPLINA</span>
<span class="local">Local: FCTE - S4</span></td><td>12</td><td>MATRICULADO(A)</td><td>235M34</td></tr>
<tr><td>FGA0146</td><td>ESTRUTURAS DE DADOS 1</td><td>01</td><td>MATRICULADO(A)</td><td>35T1</td></tr>
</tbody></table>
<h4>Tabela de Horários:</h4>
<table id="horario"><tr><td>Horários</td><td>Dom</td><td>Seg</td><td>Ter</td>
<td>Qua</td><td>Qui</td><td>Sex</td><td>Sab</td></tr>
<tr><td>08:00 - 08:55</td><td>---</td><td><span id="2_1">---</span></td>
<td><span id="3_1">---</span></td><td>---</td><td>---</td><td>---</td><td>---</td></tr>
<tr><td colspan="8">&nbsp;</td></tr></table>
<script>
var elem = document.getElementById('2_1');
if (elem) elem.innerHTML = 'MAT0027';
var elem = document.getElementById("3_1");
if (elem) elem.innerHTML = "FGA0146";
</script>
<div id="autenticacao"><h4>ATENÇÃO</h4><p>
Para verificar a autenticidade deste documento acesse
<span>https://sigaa.unb.br/sigaa/documentos/</span> informando a matrícula,
a data de emissão e o código de verificação <span>012345abcd</span></p></div>
</div>
<div id="relatorio-rodape"><table><tr>
<td class="voltar">Voltar</td><td>SIGAA | STI | Copyright © 2006-2026 - UFRN - app-teste</td>
<td class="naoImprimir">Imprimir</td></tr></table></div>
"""


@pytest.mark.parametrize("method,menu_action", ALL_DOCUMENTS)
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
        return httpx.Response(
            200,
            content=CERTIFICATE.encode()
            if method == "get_enrollment_certificate"
            else CARTEIRINHA_PDF,
        )

    async with SigaaClient(
        session_token="tok", transport=httpx.MockTransport(handle)
    ) as client:
        for viewstate in ("VS1", "VS2"):
            result = await getattr(client.documents, method)()
            if method == "get_enrollment_certificate":
                assert result.issued_at == "20/10/2026 21:52"
                assert ("Nome", "JOÃO DA CONCEIÇÃO") in result.identification
                assert len(result.enrollments) == 2
                assert (
                    result.enrollments[0][1]
                    == "CÁLCULO 3\nDOCENTE DE TESTE\nTipo: DISCIPLINA   Local: FCTE - S4"
                )
                assert result.schedule[1][2:4] == ("MAT0027", "FGA0146")
                assert len(result.schedule) == 3
                assert result.schedule[2] == ("",) * 8
                assert result.authentication.endswith("012345abcd")
                assert (
                    result.footer
                    == "SIGAA | STI | Copyright © 2006-2026 - UFRN - app-teste"
                )
            else:
                assert result == CARTEIRINHA_PDF
    assert methods == ["GET", "POST", "GET", "POST"]


@pytest.mark.parametrize("content", [b"<html>Erro do SIGAA</html>", b""])
@pytest.mark.parametrize("method,menu_action", ALL_DOCUMENTS)
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


# Recorte do portal devolvido quando o discente não tem foto no perfil.
SEM_FOTO = """
<div id="painel-erros" style="position: relative; padding-bottom: 10px;">
  <ul class="erros">
    <li>Discente n&#227;o possui foto, por favor atualize perfil para incluir foto</li>
  </ul>
</div>
"""


async def _download_com_erro(method, painel):
    def handle(request):
        if request.method == "GET":
            return httpx.Response(200, text=MENU)
        return httpx.Response(200, text=MENU + painel)

    async with SigaaClient(
        session_token="tok", transport=httpx.MockTransport(handle)
    ) as client:
        return await getattr(client.documents, method)()


@pytest.mark.parametrize("method,menu_action", DOCUMENTS)
async def test_download_sem_foto_no_perfil_e_identificado(method, menu_action):
    with pytest.raises(MissingProfilePhoto) as error:
        await _download_com_erro(method, SEM_FOTO)
    assert str(error.value) == (
        "Discente não possui foto, por favor atualize perfil para incluir foto"
    )


@pytest.mark.parametrize("method,menu_action", DOCUMENTS)
async def test_download_recusado_pelo_sigaa_repassa_o_motivo(method, menu_action):
    painel = '<ul class="erros"><li>Documento indisponível.</li></ul>'
    with pytest.raises(DocumentUnavailable) as error:
        await _download_com_erro(method, painel)
    assert not isinstance(error.value, MissingProfilePhoto)
    assert str(error.value) == "Documento indisponível."


@pytest.mark.parametrize("method,menu_action", ALL_DOCUMENTS)
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


@pytest.mark.parametrize("method,menu_action", ALL_DOCUMENTS)
async def test_documento_reabre_portal_apos_renovacao_da_sessao(method, menu_action):
    session = AsyncMock()
    session.get.side_effect = [
        httpx.Response(200, text=MENU),
        httpx.Response(200, text=MENU.replace("VS1", "VS2")),
    ]
    session.post.side_effect = [
        SessionRenewed(),
        httpx.Response(
            200,
            content=CERTIFICATE.encode()
            if method == "get_enrollment_certificate"
            else CARTEIRINHA_PDF,
        ),
    ]
    documents = Documents(session)
    result = await getattr(documents, method)()
    assert (
        result.issued_at == "20/10/2026 21:52"
        if method == "get_enrollment_certificate"
        else result == CARTEIRINHA_PDF
    )
    assert session.get.await_count == 2
    assert [
        call.kwargs["data"]["javax.faces.ViewState"]
        for call in session.post.await_args_list
    ] == ["VS1", "VS2"]
    assert all(
        call.kwargs["data"]["jscook_action"] == menu_action
        for call in session.post.await_args_list
    )


async def test_documento_retenta_sem_novo_relogin():
    session = AsyncMock()
    session.get.return_value = httpx.Response(200, text=MENU)
    session.post.side_effect = [SessionRenewed(), SessionExpired()]
    with pytest.raises(SessionExpired):
        await Documents(session).get_transcript_pdf()
    calls = [*session.get.await_args_list, *session.post.await_args_list]
    assert [call.kwargs["allow_renewal"] for call in calls] == [
        True,
        False,
        True,
        False,
    ]


async def test_documento_aceita_bytes_antes_do_cabecalho_pdf():
    session = AsyncMock()
    session.get.return_value = httpx.Response(200, text=MENU)
    session.post.return_value = httpx.Response(200, content=b"\r\n" + CARTEIRINHA_PDF)
    assert await Documents(session).get_transcript_pdf() == b"\r\n" + CARTEIRINHA_PDF


async def test_documento_sem_viewstate_nao_envia_postback():
    session = AsyncMock()
    session.get.return_value = httpx.Response(
        200, text=MENU.replace('value="VS1"', 'value=""')
    )
    with pytest.raises(SigaaParseError, match="ViewState"):
        await Documents(session).get_transcript_pdf()
    session.post.assert_not_awaited()


@pytest.mark.parametrize(
    "old,new,section",
    [
        ('id="identificacao"', 'id="outra"', "identificacao"),
        ('id="matriculas"', 'id="outra"', "matriculas"),
        ('id="horario"', 'id="outra"', "horario"),
        ('id="autenticacao"', 'id="outra"', "autenticacao"),
        ("Emitido em", "Data", "Data de emissão"),
        ("JOÃO DA CONCEIÇÃO", "", "Identificação incompleta"),
        ("Turmas Matriculadas: 2", "Turmas Matriculadas: 3", "Quantidade"),
        ("012345abcd", "", "Código de verificação"),
        ("'MAT0027'", "carregarHorario()", "Script de horários"),
        ("'2_1'", "'2_99'", "Preenchimento de horário"),
        ("'MAT0027'", "'<img src=x>'", "Preenchimento de horário"),
    ],
)
async def test_atestado_incompleto_nao_e_entregue(old, new, section):
    session = AsyncMock()
    session.get.return_value = httpx.Response(200, text=MENU)
    session.post.return_value = httpx.Response(200, text=CERTIFICATE.replace(old, new))
    with pytest.raises(SigaaParseError, match=section):
        await Documents(session).get_enrollment_certificate()


async def test_atestado_preserva_conflitos_de_horario_sem_executar_script():
    session = AsyncMock()
    session.get.return_value = httpx.Response(200, text=MENU)
    session.post.return_value = httpx.Response(
        200, text=CERTIFICATE.replace("'MAT0027'", "'MAT0027<br/>FGA0146'")
    )
    certificate = await Documents(session).get_enrollment_certificate()
    assert certificate.schedule[1][2] == "MAT0027 FGA0146"


async def test_atestado_sem_script_nao_entrega_grade_vazia():
    import re

    session = AsyncMock()
    session.get.return_value = httpx.Response(200, text=MENU)
    session.post.return_value = httpx.Response(
        200, text=re.sub(r"<script>.*?</script>", "", CERTIFICATE, flags=re.DOTALL)
    )
    with pytest.raises(SigaaParseError, match="Grade de horários não preenchida"):
        await Documents(session).get_enrollment_certificate()
