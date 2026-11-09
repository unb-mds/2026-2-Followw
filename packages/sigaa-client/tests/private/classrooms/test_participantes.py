import httpx
import pytest
from bs4 import BeautifulSoup

from sigaa_client import (
    ClassroomRole,
    SessionExpired,
    SigaaClient,
)
from sigaa_client.config import (
    CLASSROOMS_PATH,
    PARTICIPANTS_PATH,
    PARTICIPANTS_TIMEOUT,
    SIGAA_BASE_URL,
)
from sigaa_client.exceptions import SigaaParseError
from sigaa_client.private.classrooms import Classrooms, _parse_members
from sigaa_client.private.session import Session

from ...fakes import CREDENTIALS, FakeSigaa

PARTICIPANTS = """
<html><body>
<fieldset><legend> Docentes (1)</legend></fieldset>
<table class="participantes"><tr>
  <td align="center" width="72"><img src="https://arquivos.unb.br/arquivos/abc/foto.jpg"/></td>
  <td valign="top">
  <strong><a href="/sigaa/public/docente/portal.jsf?siape=$?siape=1984632">NOME DOCENTE</a></strong><br/>
  Departamento: <em>CAMPUS UNB GAMA: FCTE</em><br/>
  Formação: <em>DOUTORADO</em><br/>
  Usuário(a): <em>82766657134</em><br/>
  E-Mail: <em>docente@unb.br</em><br/>
</td></tr></table>
<fieldset><legend> Discentes (1)</legend></fieldset>
<table class="participantes"><tr>
  <td width="47"><img src="/sigaa/img/no_picture.png"/></td>
  <td valign="top">
  <strong>NOME DISCENTE
    <a href="#" onclick="A4J.AJAX.Submit('x',event,{'parameters':{'idPessoa':2660998}});">perfil</a>
  </strong><br/>
  Curso: <em>ENGENHARIA DE SOFTWARE/FCTE </em><br/>
  Matrícula: <em>251034885</em><br/>
  Usuário(a): <em>251034885 </em><br/>
  E-mail: <em>discente@example.com </em>
</td></tr></table>
</body></html>
"""

CONTEXT = (
    "<script>var nomeTurma = \"<div style='padding:10px'>"
    'Turma: FGA0146 - ESTRUTURAS DE DADOS 1 (2026.2 - T01)</div>";</script>'
)

HISTORY_FORM = """
<html><body><table class="listagem">
  <tr><td class="periodo" colspan="6">2026.2</td></tr>
  <tr>
    <td>FGA0146 - ESTRUTURAS DE DADOS 1</td><td align="center">01</td>
    <td align="right">60h</td><td>35M5  35T1 (10/08/2026 - 14/12/2026)</td>
    <td><a href="#" title="Acessar Turma Virtual"
      onclick="jsfcljs(x,{'form:link':'form:link','frontEndIdTurma':'AAA','inciadoPelaBusca':'true'},'');"
    ><img/></a></td>
  </tr>
</table></body></html>
""".replace(
    "<body>",
    '<body><form name="form"><input name="javax.faces.ViewState" value="j1"/>',
).replace("</body>", "</form></body>")


def test_participantes_separam_docente_de_discente():
    soup = BeautifulSoup(PARTICIPANTS, "lxml")

    docente = _parse_members(soup, "Docentes", ClassroomRole.PROFESSOR)[0]
    assert docente.registration is None  # o "Usuário(a)" do docente é o CPF
    assert "82766657134" not in docente.model_dump_json()
    assert docente.email == "docente@unb.br"
    assert docente.photo == "https://arquivos.unb.br/arquivos/abc/foto.jpg"

    discente = _parse_members(soup, "Discentes", ClassroomRole.ALUNO)[0]
    assert discente.registration == "251034885"
    assert (discente.course, discente.unit) == ("ENGENHARIA DE SOFTWARE", "FCTE")
    assert discente.person_id == 2660998
    assert discente.photo is None  # no_picture.png não é foto


def test_participante_docente_com_email_nao_institucional_fica_nulo():
    soup = BeautifulSoup(
        PARTICIPANTS.replace("docente@unb.br", "docente@gmail.com"), "lxml"
    )
    docente = _parse_members(soup, "Docentes", ClassroomRole.PROFESSOR)[0]
    assert docente.email is None

    discente = _parse_members(soup, "Discentes", ClassroomRole.ALUNO)[0]
    assert discente.email == "discente@example.com"


def test_lista_ausente_e_barulhenta():
    soup = BeautifulSoup("<html><body></body></html>", "lxml")

    with pytest.raises(SigaaParseError):
        _parse_members(soup, "Discentes", ClassroomRole.ALUNO)


class ParticipantsSigaa:
    """Simula o CAS e expira a sessão ao abrir os participantes `expirations` vezes."""

    def __init__(self, expirations: int) -> None:
        self.auth = FakeSigaa()
        self.auth.valid_tokens.add("vivo")
        self.expirations = expirations
        self.entries = 0

    def __call__(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        entering = request.method == "POST" and request.url.host == "sigaa.unb.br"
        if path not in (CLASSROOMS_PATH, PARTICIPANTS_PATH) and not entering:
            return self.auth(request)
        if path == PARTICIPANTS_PATH and self.expirations:
            self.expirations -= 1
            self.auth.valid_tokens.clear()
        if request.headers.get("cookie", "").removeprefix("JSESSIONID=") not in (
            self.auth.valid_tokens
        ):
            return httpx.Response(302, headers={"location": "/sigaa/verTelaLogin.do"})
        if entering:
            self.entries += 1
            return httpx.Response(200, text="")
        if path == CLASSROOMS_PATH:
            return httpx.Response(200, text=HISTORY_FORM)
        return httpx.Response(200, text=PARTICIPANTS + CONTEXT)


async def test_relogin_no_meio_da_tela_reabre_a_turma_na_sessao_nova():
    sigaa = ParticipantsSigaa(expirations=1)
    async with SigaaClient(
        CREDENTIALS, session_token="vivo", transport=httpx.MockTransport(sigaa)
    ) as client:
        membros = await client.classrooms.list_classroom_members("AAA")

    assert len(membros) == 2
    assert sigaa.auth.logins == 1
    # A turma aberta morreu com a sessão antiga: entra de novo antes de reler.
    assert sigaa.entries == 2


async def test_tela_que_expira_de_novo_apos_o_relogin_desiste():
    sigaa = ParticipantsSigaa(expirations=2)
    async with SigaaClient(
        CREDENTIALS, session_token="vivo", transport=httpx.MockTransport(sigaa)
    ) as client:
        with pytest.raises(SessionExpired):
            await client.classrooms.list_classroom_members("AAA")

    assert sigaa.auth.logins == 1


async def test_participantes_esperam_mais_que_o_timeout_padrao():
    timeouts: dict[str, float] = {}

    def sigaa(request: httpx.Request) -> httpx.Response:
        timeouts[request.url.path] = request.extensions["timeout"]["read"]
        if request.url.path == CLASSROOMS_PATH:
            return httpx.Response(200, text=HISTORY_FORM)
        if request.url.path == PARTICIPANTS_PATH:
            return httpx.Response(200, text=PARTICIPANTS + CONTEXT)
        return httpx.Response(200, text="")

    http = httpx.AsyncClient(
        base_url=SIGAA_BASE_URL, transport=httpx.MockTransport(sigaa), timeout=15
    )
    async with http:
        session = Session(http, session_token="token")
        membros = await Classrooms(session).list_classroom_members("AAA")

    assert len(membros) == 2
    # Turma com milhares de alunos demora mais que isso para o SIGAA responder.
    assert timeouts[PARTICIPANTS_PATH] == PARTICIPANTS_TIMEOUT
    assert timeouts[CLASSROOMS_PATH] == 15
