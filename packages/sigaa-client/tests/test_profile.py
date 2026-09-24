from datetime import date

import httpx
import pytest

from sigaa_client import News, SigaaClient, SigaaParseError

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
    assert profile.bio == "Bio de teste."
    assert profile.ira == 3.9524
    assert profile.mp == 4.1724


async def test_get_profile_sem_indices_academicos_vem_none():
    sigaa = FakeDashboard(page=DASHBOARD_SEM_INDICES)
    async with SigaaClient(session_token="tok", transport=sigaa.transport) as client:
        profile = await client.profile.get_profile()

    assert profile.ira is None
    assert profile.mp is None


UPDATES = """
<html><body><div id="atualizacoes-turma"><div class="rotator">
  <table>
    <tr><td>
      12/09/2026 -
      <a href="#" onclick="jsfcljs(x,{'formAtualizacoesTurmas:j_id':'formAtualizacoesTurmas:j_id','idTurma':'1615025'},'');">MATEMÁTICA DISCRETA 2 (2026.2)</a>
    </td></tr>
    <tr><td>Nova Not&#237;cia: Link Whatsapp da turma</td></tr>
  </table>
  <table>
    <tr><td>
      15/07/2026 -
      <a href="#" onclick="jsfcljs(x,{'idTurma':'1615025'},'');">MATEMÁTICA DISCRETA 2 (2026.2)</a>
    </td></tr>
    <tr><td>Avaliação marcada para o dia 21/05/2026</td></tr>
  </table>
</div></div></body></html>
"""


async def test_noticias_da_home_ignoram_outras_atualizacoes():
    sigaa = FakeDashboard(page=UPDATES)
    async with SigaaClient(session_token="tok", transport=sigaa.transport) as client:
        noticias = await client.profile.list_news()

    assert noticias == [
        News(
            classroom_sigaa_id=1615025,
            title="Link Whatsapp da turma",
            published_on=date(2026, 9, 12),
        )
    ]


async def test_home_sem_painel_de_turmas_nao_tem_noticias():
    sigaa = FakeDashboard(page=DASHBOARD)
    async with SigaaClient(session_token="tok", transport=sigaa.transport) as client:
        assert await client.profile.list_news() == []


async def test_noticia_da_home_sem_turma_e_barulhenta():
    sigaa = FakeDashboard(page=UPDATES.replace("'idTurma':'1615025'", "", 1))
    async with SigaaClient(session_token="tok", transport=sigaa.transport) as client:
        with pytest.raises(SigaaParseError):
            await client.profile.list_news()
