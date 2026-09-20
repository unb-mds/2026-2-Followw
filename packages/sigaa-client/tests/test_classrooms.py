import pytest
from bs4 import BeautifulSoup

from sigaa_client import ClassroomRole
from sigaa_client.exceptions import SigaaParseError
from sigaa_client.private.classrooms import (
    _merge,
    _parse_dashboard,
    _parse_history,
    _parse_members,
)

HISTORY = """
<html><body><table class="listagem">
  <tr><td class="periodo" colspan="6">2026.2</td></tr>
  <tr>
    <td>FGA0146 - ESTRUTURAS DE DADOS 1</td><td align="center">01</td>
    <td align="right">60h</td><td>35M5  35T1 (10/08/2026 - 14/12/2026)</td>
    <td><a href="#" title="Acessar Turma Virtual"
      onclick="jsfcljs(x,{'form:link':'form:link','frontEndIdTurma':'AAA','inciadoPelaBusca':'true'},'');"
    ><img/></a></td>
  </tr>
  <tr><td class="periodo" colspan="6">2025.2</td></tr>
  <tr>
    <td>FGA0158 - ORIENTAÇÃO A OBJETOS</td><td align="center">02</td>
    <td align="right">30h</td><td>24T23</td>
    <td><a href="#" title="Acessar Turma Virtual"
      onclick="jsfcljs(x,{'frontEndIdTurma':'BBB'},'');"><img/></a></td>
  </tr>
</table></body></html>
"""

DASHBOARD = """
<html><body><table>
  <tr><td colspan="5">2026.2</td></tr>
  <tr class="odd">
    <td class="descricao">
      <form id="form_acessarTurmaVirtual" name="form_acessarTurmaVirtual">
        <a href="#" onclick="jsfcljs(x,{'frontEndIdTurma':'AAA'},'');">ESTRUTURAS DE DADOS 1</a>
      </form>
    </td>
    <td class="info">FCTE - MOCAP</td>
    <td class="info"><center>35M5  35T1 (10/08/2026 - 14/12/2026)
      <span><div class="popUp" id="ajuda1">Terça-feira 12:00 às 13:50</div></span>
    </center></td>
    <td></td>
  </tr>
  <tr><td colspan="5" id="linha_1617644" style="display: none;"></td></tr>
</table></body></html>
"""

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


def test_history_traz_codigo_carga_horaria_e_periodo():
    turmas = _parse_history(HISTORY)

    assert list(turmas) == ["AAA", "BBB"]
    turma = turmas["AAA"]
    assert (turma.number, turma.semester) == ("01", "2026.2")
    assert turma.schedule == "35M5 35T1"
    assert (turma.subject.code, turma.subject.hours) == ("FGA0146", 60)
    assert turmas["BBB"].semester == "2025.2"


def test_dashboard_traz_local_e_id_numerico():
    turma = _parse_dashboard(DASHBOARD)["AAA"]

    assert turma.sigaa_id == 1617644
    assert (turma.subject.unity, turma.room) == ("FCTE", "MOCAP")
    # O balão de ajuda não pode vazar para o horário.
    assert turma.schedule == "35M5 35T1"


def test_merge_completa_o_historico_com_o_portal():
    turma = _merge(_parse_history(HISTORY)["AAA"], _parse_dashboard(DASHBOARD)["AAA"])

    assert turma.subject.code == "FGA0146"
    assert (turma.room, turma.sigaa_id) == ("MOCAP", 1617644)


def test_dashboard_sem_turmas_nao_quebra():
    assert _parse_dashboard("<html><body></body></html>") == {}


def test_participantes_separam_docente_de_discente():
    soup = BeautifulSoup(PARTICIPANTS, "lxml")

    docente = _parse_members(soup, "Docentes", ClassroomRole.PROFESSOR)[0]
    assert docente.registration is None  # o "Usuário(a)" do docente é o CPF
    assert "82766657134" not in docente.model_dump_json()
    assert docente.email == "docente@unb.br"
    assert docente.photo == "https://arquivos.unb.br/arquivos/abc/foto.jpg"

    discente = _parse_members(soup, "Discentes", ClassroomRole.ALUNO)[0]
    assert discente.registration == "251034885"
    assert (discente.course, discente.unity) == ("ENGENHARIA DE SOFTWARE", "FCTE")
    assert discente.person_id == 2660998
    assert discente.photo is None  # no_picture.png não é foto


def test_lista_ausente_e_barulhenta():
    soup = BeautifulSoup("<html><body></body></html>", "lxml")

    with pytest.raises(SigaaParseError):
        _parse_members(soup, "Discentes", ClassroomRole.ALUNO)
