import pytest

from sigaa_client.exceptions import SigaaParseError
from sigaa_client.private.classrooms import Classrooms

from ...fakes import HISTORY_FORM, SharedSession

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


@pytest.mark.parametrize(
    ("original", "outro"),
    [("FGA0146", "FGA0158"), ("2026.2", "2025.2"), ("T01", "T02")],
)
async def test_turma_trocada_por_outro_uso_da_sessao_e_reaberta(original, outro):
    session = SharedSession(
        PARTICIPANTS.replace("NOME DISCENTE", "OUTRA TURMA")
        + CONTEXT.replace(original, outro),
        PARTICIPANTS + CONTEXT,
        history=HISTORY_FORM,
    )

    membros = await Classrooms(session).list_classroom_members("AAA")  # type: ignore[arg-type]

    assert {m.name for m in membros} == {"NOME DOCENTE", "NOME DISCENTE"}
    assert session.entries == 2


async def test_turma_sempre_trocada_desiste_barulhenta():
    session = SharedSession(*[PARTICIPANTS + OTHER_CONTEXT] * 3, history=HISTORY_FORM)

    with pytest.raises(SigaaParseError):
        await Classrooms(session).list_classroom_members("AAA")  # type: ignore[arg-type]
    assert session.entries == 3
