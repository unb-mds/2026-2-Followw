import httpx
import pytest

from sigaa_client import (
    CourseShift,
    CurriculumWorkload,
    SigaaClient,
    SigaaParseError,
)

CARD = """
<div id="perfil-docente">
  <div class="foto"><img src="/arquivos/foto.jpg"/></div>
  <div class="info-docente">
    <span class="nome">FULANO DE TAL</span>
    Bio de teste.
  </div>
  <table>
    <tr><td>Matrícula:</td><td>251000000</td></tr>
    <tr><td>Curso:</td><td>ENGENHARIA DE SOFTWARE/FCTE - Bacharelado</td></tr>
    <tr><td>Nível:</td><td>Graduação</td></tr>
    <tr><td colspan="2">
      <table>
        <tr><td><acronym title="Índice de Rendimento Acadêmico">IRA:</acronym></td><td>3.9524</td></tr>
        <tr><td><acronym title="Média Ponderada">MP:</acronym></td><td>4.1724</td></tr>
      </table>
    </td></tr>
    <tr><td colspan="2">
      <i><center>Integraliza&#231;&#245;es:</center></i>
      <table>
        <tr><td> CH. Obrigat&#243;ria Pendente </td><td align="right"> 2175 </td></tr>
        <tr><td> CH. Optativa Pendente </td><td align="right"> 420 </td></tr>
        <tr><td> CH. Total Curr&#237;culo </td><td align="right"> 3525 </td></tr>
        <tr><td> CH. Complementar Pendente </td><td align="right"> 0 </td></tr>
        <tr><td colspan="2" align="center"> 26% Integralizado </td></tr>
      </table>
    </td></tr>
  </table>
</div>
"""

CARD_SEM_INDICES = """
<div id="perfil-docente">
  <div class="info-docente">
    <span class="nome">FULANO DE TAL</span>
  </div>
  <table>
    <tr><td>Matrícula:</td><td>251000000</td></tr>
    <tr><td>Curso:</td><td>ENGENHARIA DE SOFTWARE/FCTE - Bacharelado</td></tr>
    <tr><td>Nível:</td><td>Graduação</td></tr>
  </table>
</div>
"""

DASHBOARD = f"<html><body>{CARD}</body></html>"
DASHBOARD_SEM_INDICES = f"<html><body>{CARD_SEM_INDICES}</body></html>"


class FakeDashboard:
    def __init__(self, page: str = DASHBOARD) -> None:
        self.page = page
        self.requests: list[httpx.Request] = []

    @property
    def transport(self) -> httpx.MockTransport:
        return httpx.MockTransport(self)

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        return httpx.Response(200, text=self.page)


async def test_get_profile_faz_um_unico_get():
    sigaa = FakeDashboard()
    async with SigaaClient(session_token="tok", transport=sigaa.transport) as client:
        profile = await client.profile.get_profile()

    assert [r.method for r in sigaa.requests] == ["GET"]
    assert profile.name == "FULANO DE TAL"
    assert profile.registration == "251000000"
    assert (profile.course, profile.unity) == ("ENGENHARIA DE SOFTWARE", "FCTE")
    assert profile.shift == CourseShift.DIURNO
    assert profile.bio == "Bio de teste."
    assert profile.ira == 3.9524
    assert profile.mp == 4.1724
    assert profile.integralization == 26
    assert profile.workload == CurriculumWorkload(
        total=3525,
        pending_mandatory=2175,
        pending_optional=420,
        pending_complementary=0,
    )


@pytest.mark.parametrize(
    ("course", "shift"),
    [
        ("ENGENHARIA DE SOFTWARE/FCTE - Bacharelado - MT", CourseShift.DIURNO),
        ("ADMINISTRAÇÃO/FCTE - Bacharelado - N", CourseShift.NOTURNO),
        ("ADMINISTRAÇÃO/FCTE - Bacharelado", CourseShift.DIURNO),
        ("ADMINISTRAÇÃO/FCTE", None),
    ],
)
async def test_get_profile_turno_vem_do_fim_da_linha_do_curso(course, shift):
    page = DASHBOARD.replace("ENGENHARIA DE SOFTWARE/FCTE - Bacharelado", course)
    sigaa = FakeDashboard(page=page)
    async with SigaaClient(session_token="tok", transport=sigaa.transport) as client:
        profile = await client.profile.get_profile()

    assert (profile.course, profile.unity) == (course.split("/")[0], "FCTE")
    assert profile.shift == shift


async def test_get_profile_sem_indices_academicos_vem_none():
    sigaa = FakeDashboard(page=DASHBOARD_SEM_INDICES)
    async with SigaaClient(session_token="tok", transport=sigaa.transport) as client:
        profile = await client.profile.get_profile()

    assert profile.ira is None
    assert profile.mp is None
    assert profile.workload is None


async def test_carga_horaria_incompleta_e_barulhenta():
    page = DASHBOARD.replace("CH. Optativa Pendente", "CH. Outra Coisa")
    sigaa = FakeDashboard(page=page)
    async with SigaaClient(session_token="tok", transport=sigaa.transport) as client:
        with pytest.raises(SigaaParseError):
            await client.profile.get_profile()
