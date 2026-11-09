import pytest

from sigaa_client.exceptions import SigaaParseError
from sigaa_client.private.classrooms import (
    Classrooms,
    _assert_context,
    _parse_history,
)

from ...fakes import SharedSession

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
</table></body></html>
"""

HISTORY_FORM = HISTORY.replace(
    "<body>",
    '<body><form name="form"><input name="javax.faces.ViewState" value="j1"/>',
).replace("</body>", "</form></body>")

PARTICIPANTS = """
<html><body>
<fieldset><legend> Docentes (1)</legend></fieldset>
<table class="participantes"><tr>
  <td valign="top"><strong>NOME DOCENTE</strong></td>
</tr></table>
<fieldset><legend> Discentes (1)</legend></fieldset>
<table class="participantes"><tr>
  <td valign="top"><strong>NOME DISCENTE</strong></td>
</tr></table>
</body></html>
"""

CONTEXT = (
    "<script>var nomeTurma = \"<div style='padding:10px'>"
    'Turma: FGA0146 - ESTRUTURAS DE DADOS 1 (2026.2 - T01)</div>";</script>'
)

OTHER_CONTEXT = CONTEXT.replace(
    "FGA0146 - ESTRUTURAS DE DADOS 1 (2026.2 - T01)",
    "FGA0158 - ORIENTAÇÃO A OBJETOS (2025.2 - T02)",
)


async def test_turma_trocada_por_outro_uso_da_sessao_e_reaberta():
    session = SharedSession(
        PARTICIPANTS + OTHER_CONTEXT, PARTICIPANTS + CONTEXT, history=HISTORY_FORM
    )

    membros = await Classrooms(session).list_classroom_members("AAA")  # type: ignore[arg-type]

    assert len(membros) == 2
    assert session.entries == 2


async def test_turma_sempre_trocada_desiste_barulhenta():
    session = SharedSession(*[PARTICIPANTS + OTHER_CONTEXT] * 3, history=HISTORY_FORM)

    with pytest.raises(SigaaParseError):
        await Classrooms(session).list_classroom_members("AAA")  # type: ignore[arg-type]
    assert session.entries == 3


def test_contexto_confere_codigo_numero_e_semestre():
    turma = _parse_history(HISTORY)["AAA"]

    _assert_context(CONTEXT, turma)

    with pytest.raises(SigaaParseError):
        _assert_context(CONTEXT.replace("T01", "T02"), turma)
