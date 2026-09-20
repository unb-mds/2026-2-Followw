from datetime import date
from decimal import Decimal
from pathlib import Path

import httpx
import pytest
from bs4 import BeautifulSoup

from sigaa_client import SigaaClient
from sigaa_client.exceptions import SigaaParseError
from sigaa_client.private.profile import (
    _STUDENT_CARD_MENU_ACTION,
    _month_number,
    _parse_amount,
    _parse_datetime,
    _restaurant_credentials,
    _restaurant_statement,
)

CARTEIRINHA_PDF = (Path(__file__).parent / "fixtures" / "carteirinha.pdf").read_bytes()

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
  </table>
</div>
"""

FORM_EXTRATO = """
<form id="formExibirExtrato" name="formExibirExtrato" method="post"
      action="/sigaa/portais/discente/discente.jsf">
  <input type="hidden" name="formExibirExtrato" value="formExibirExtrato" />
  <a href="#" onclick="jsfcljs(document.getElementById('formExibirExtrato'),
    {'formExibirExtrato:botao':'formExibirExtrato:botao'},'');return false;"
  >Mostrar Extrato do Restaurante</a>
</form>
<input type="hidden" name="javax.faces.ViewState" value="VS1" />
"""

FORM_MENU_DISCENTE = """
<form id="menu:form_menu_discente" name="menu:form_menu_discente" method="post"
      action="/sigaa/portais/discente/discente.jsf">
  <input type="hidden" name="menu:form_menu_discente" value="menu:form_menu_discente" />
  <input type="hidden" name="id" value="494110" />
  <input type="hidden" name="jscook_action" />
  <input type="hidden" name="javax.faces.ViewState" value="VS1" />
</form>
"""

DASHBOARD_SEM_EXTRATO = (
    f"<html><body>{CARD}{FORM_EXTRATO}{FORM_MENU_DISCENTE}</body></html>"
)

DASHBOARD_SEM_LINK_DE_EXTRATO = f"<html><body>{CARD}</body></html>"

EXTRATO_TABLE = """
<h4>Extrato no Restaurante Universitário</h4>
<table>
  <tr><td>20/09/2026 12:23</td><td>Saldo</td><td>R$ 0,00</td></tr>
  <tr><td>17/09/2026 12:00</td><td>Grupo 1 Almoço</td><td>R$ 8,50</td></tr>
</table>
"""

DASHBOARD_COM_EXTRATO = f"<html><body>{CARD}{EXTRATO_TABLE}</body></html>"


class FakeDashboard:
    """Simula o postback: só devolve o extrato pra quem manda o form certo."""

    def __init__(self, initial: str = DASHBOARD_SEM_EXTRATO) -> None:
        self.initial = initial
        self.requests: list[httpx.Request] = []

    @property
    def transport(self) -> httpx.MockTransport:
        return httpx.MockTransport(self)

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if request.method == "GET":
            return httpx.Response(200, text=self.initial)

        payload = dict(httpx.QueryParams(request.content.decode()))
        if payload.get("formExibirExtrato") == "formExibirExtrato":
            return httpx.Response(200, text=DASHBOARD_COM_EXTRATO)
        if payload.get("jscook_action") == _STUDENT_CARD_MENU_ACTION:
            return httpx.Response(
                200,
                content=CARTEIRINHA_PDF,
                headers={"content-type": "application/pdf"},
            )
        return httpx.Response(200, text=self.initial)


async def test_get_profile_faz_um_unico_get_e_nao_busca_o_extrato():
    sigaa = FakeDashboard()
    async with SigaaClient(session_token="tok", transport=sigaa.transport) as client:
        profile = await client.profile.get_profile()

    assert [r.method for r in sigaa.requests] == ["GET"]
    assert profile.name == "FULANO DE TAL"
    assert profile.registration == "251000000"


async def test_get_restaurant_statement_faz_get_e_postback():
    sigaa = FakeDashboard()
    async with SigaaClient(session_token="tok", transport=sigaa.transport) as client:
        statement = await client.profile.get_restaurant_statement()

    assert [r.method for r in sigaa.requests] == ["GET", "POST"]
    assert statement[0].description == "Saldo"
    assert statement[1].amount == Decimal("8.50")


async def test_get_restaurant_statement_sem_link_devolve_none_e_nao_faz_postback():
    sigaa = FakeDashboard(initial=DASHBOARD_SEM_LINK_DE_EXTRATO)
    async with SigaaClient(session_token="tok", transport=sigaa.transport) as client:
        statement = await client.profile.get_restaurant_statement()

    assert [r.method for r in sigaa.requests] == ["GET"]
    assert statement is None


def test_restaurant_statement_ausente_devolve_none():
    soup = BeautifulSoup(DASHBOARD_SEM_EXTRATO, "lxml")
    assert _restaurant_statement(soup) is None


def test_restaurant_statement_parseia_data_descricao_e_valor():
    soup = BeautifulSoup(DASHBOARD_COM_EXTRATO, "lxml")
    entries = _restaurant_statement(soup)

    assert entries[0].description == "Saldo"
    assert entries[0].amount == Decimal("0.00")
    assert entries[1].description == "Grupo 1 Almoço"
    assert entries[1].amount == Decimal("8.50")


def test_parse_amount_le_formato_brasileiro():
    assert _parse_amount("R$ 1.234,56") == Decimal("1234.56")


def test_parse_amount_invalido_e_barulhento():
    with pytest.raises(SigaaParseError):
        _parse_amount("grátis")


def test_parse_datetime_invalido_e_barulhento():
    with pytest.raises(SigaaParseError):
        _parse_datetime("ontem")


async def test_get_restaurant_credentials_le_token_e_validade():
    sigaa = FakeDashboard()
    async with SigaaClient(session_token="tok", transport=sigaa.transport) as client:
        credentials = await client.profile.get_restaurant_credentials()

    assert [r.method for r in sigaa.requests] == ["GET", "POST"]
    assert credentials.token == "TESTE0000000001"
    assert credentials.valid_until == date(2027, 3, 1)


async def test_get_restaurant_credentials_sem_menu_e_barulhento():
    sigaa = FakeDashboard(initial=DASHBOARD_SEM_LINK_DE_EXTRATO)
    async with SigaaClient(session_token="tok", transport=sigaa.transport) as client:
        with pytest.raises(SigaaParseError):
            await client.profile.get_restaurant_credentials()

    assert [r.method for r in sigaa.requests] == ["GET"]


def test_restaurant_credentials_le_token_e_validade_do_pdf():
    credentials = _restaurant_credentials(CARTEIRINHA_PDF)

    assert credentials.token == "TESTE0000000001"
    assert credentials.valid_until == date(2027, 3, 1)


def test_month_number_ignora_acento_e_caixa():
    assert _month_number("MARÇO") == 3


def test_month_number_invalido_e_barulhento():
    with pytest.raises(SigaaParseError):
        _month_number("Blursday")
