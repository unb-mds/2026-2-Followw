import pytest

from sigaa_client import ClassroomNotFound
from sigaa_client.config import CLASSROOMS_PATH, DASHBOARD_PATH
from sigaa_client.private.classrooms import (
    Classrooms,
    _merge,
    _parse_dashboard,
    _parse_history,
)

from ...fakes import PagesSession

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
    assert (turma.subject.unit, turma.room) == ("FCTE", "MOCAP")
    # O balão de ajuda não pode vazar para o horário.
    assert turma.schedule == "35M5 35T1"


def test_merge_completa_o_historico_com_o_portal():
    turma = _merge(_parse_history(HISTORY)["AAA"], _parse_dashboard(DASHBOARD)["AAA"])

    assert turma.subject.code == "FGA0146"
    assert (turma.room, turma.sigaa_id) == ("MOCAP", 1617644)


def test_dashboard_sem_turmas_nao_quebra():
    assert _parse_dashboard("<html><body></body></html>") == {}


async def test_historico_completo_marca_as_turmas_atuais():
    so_no_portal = DASHBOARD.replace("'AAA'", "'CCC'")
    session = PagesSession({CLASSROOMS_PATH: HISTORY, DASHBOARD_PATH: DASHBOARD})

    turmas = await Classrooms(session).list_classrooms()  # type: ignore[arg-type]
    session.pages[DASHBOARD_PATH] = so_no_portal
    com_extra = await Classrooms(session).list_classrooms()  # type: ignore[arg-type]

    assert [(t.id, t.current) for t in turmas] == [("AAA", True), ("BBB", False)]
    assert [(t.id, t.current) for t in com_extra] == [
        ("AAA", False),
        ("BBB", False),
        ("CCC", True),
    ]


async def test_turma_fora_do_historico_nao_e_erro_de_layout():
    session = PagesSession({CLASSROOMS_PATH: HISTORY})

    with pytest.raises(ClassroomNotFound):
        await Classrooms(session).list_classroom_news("CCC")  # type: ignore[arg-type]
