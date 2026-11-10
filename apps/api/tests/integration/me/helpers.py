from datetime import UTC, datetime
from decimal import Decimal

from pydantic import SecretStr
from sigaa_client import (
    Credentials,
    CurriculumWorkload,
    RestaurantStatementEntry,
    UserProfile,
)
from sigaa_client import UserLevel as SigaaUserLevel

CREDENCIAIS = Credentials(registration="251000000", password=SecretStr("senha123"))


NO_CACHE = {"Cache-Control": "no-cache"}


PERFIL = """
<html><body><div id="perfil-docente">
  <div class="foto"><img src="/arquivos/foto.jpg" /></div>
  <div class="info-docente"><span class="nome">NOME DISCENTE</span>Bio de teste.</div>
  <table>
    <tr><td>Matrícula:</td><td>251000000</td></tr>
    <tr><td>Curso:</td><td>ENGENHARIA DE SOFTWARE/FCTE - Bacharelado</td></tr>
    <tr><td>Nível:</td><td>GRADUAÇÃO</td></tr>
    <tr><td>Entrada:</td><td>2025.1</td></tr>
    <tr><td colspan="2"><table>
      <tr><td><acronym>IRA:</acronym></td><td>3.9524</td></tr>
      <tr><td><acronym>MP:</acronym></td><td>4.1724</td></tr>
    </table></td></tr>
    <tr><td colspan="2"><table>
      <tr><td> CH. Obrigat&#243;ria Pendente </td><td> 2175 </td></tr>
      <tr><td> CH. Optativa Pendente </td><td> 420 </td></tr>
      <tr><td> CH. Total Curr&#237;culo </td><td> 3525 </td></tr>
      <tr><td> CH. Complementar Pendente </td><td> 0 </td></tr>
    </table></td></tr>
  </table>
  <span>35% Integralizado</span>
</div></body></html>
"""


def _entry(description, amount="0.00", *, day=25):
    return RestaurantStatementEntry(
        occurred_at=datetime.fromisoformat(f"2026-09-{day}T12:00:00"),
        description=description,
        amount=Decimal(amount),
    )


DOCUMENT_DOWNLOADS = [
    ("student-card", "get_student_card_pdf"),
    ("transcript", "get_transcript_pdf"),
]


_SEM_FOTO = "Não foi possível emitir a carteirinha pois você não possui foto de perfil."


AGORA = datetime(2026, 9, 22, tzinfo=UTC)


PERFIL_LIDO = UserProfile(
    name="NOME DISCENTE",
    registration="251000000",
    photo=None,
    bio="Bio.",
    unit="FCTE",
    course="ENGENHARIA DE SOFTWARE",
    shift=None,
    entry_semester="2025.1",
    integralization=35,
    workload=CurriculumWorkload(
        total=3525,
        pending_mandatory=2175,
        pending_optional=420,
        pending_complementary=0,
    ),
    ira=3.9,
    mp=4.1,
    level=SigaaUserLevel.GRADUACAO,
)
