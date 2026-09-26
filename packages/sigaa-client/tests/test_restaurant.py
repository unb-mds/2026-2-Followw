from datetime import date
from decimal import Decimal
from pathlib import Path

import httpx
import pytest
from bs4 import BeautifulSoup

from sigaa_client import RestaurantStatement, SigaaClient
from sigaa_client.exceptions import SigaaParseError
from sigaa_client.private.restaurant import (
    _STUDENT_CARD_MENU_ACTION,
    _credentials,
    _month_number,
    _parse_amount,
    _statement,
)

CARTEIRINHA_PDF = (Path(__file__).parent / "fixtures" / "carteirinha.pdf").read_bytes()

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

EXTRATO_TABLE = """
<h4>Extrato no Restaurante Universitário</h4>
<table>
  <tr><td>20/09/2026 12:23</td><td>Saldo</td><td>R$ 0,00</td></tr>
  <tr><td>17/09/2026 12:00</td><td>Grupo 1 Almoço</td><td>R$ 8,50</td></tr>
</table>
"""

DASHBOARD = f"<html><body>{FORM_EXTRATO}{FORM_MENU_DISCENTE}</body></html>"

DASHBOARD_SEM_NADA = "<html><body></body></html>"

DASHBOARD_COM_EXTRATO = f"<html><body>{EXTRATO_TABLE}</body></html>"


class FakeDashboard:
    """Simula o postback: só devolve o extrato/PDF pra quem manda o form certo."""

    def __init__(self, initial: str = DASHBOARD, *, keep_link: bool = False) -> None:
        self.initial = initial
        self.expanded = False
        self.keep_link = keep_link
        self.statement = EXTRATO_TABLE
        self.requests: list[httpx.Request] = []

    @property
    def transport(self) -> httpx.MockTransport:
        return httpx.MockTransport(self)

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if request.method == "GET":
            if self.expanded:
                return httpx.Response(
                    200, text=self.statement + (FORM_EXTRATO if self.keep_link else "")
                )
            return httpx.Response(200, text=self.initial)

        payload = dict(httpx.QueryParams(request.content.decode()))
        if payload.get("formExibirExtrato") == "formExibirExtrato":
            assert payload["javax.faces.ViewState"] == "VS1"
            self.expanded = not self.expanded
            return httpx.Response(
                200, text=self.statement if self.expanded else self.initial
            )
        if payload.get("jscook_action") == _STUDENT_CARD_MENU_ACTION:
            return httpx.Response(
                200,
                content=CARTEIRINHA_PDF,
                headers={"content-type": "application/pdf"},
            )
        return httpx.Response(200, text=self.initial)


async def test_get_restaurant_statement_faz_get_e_postback():
    sigaa = FakeDashboard()
    async with SigaaClient(session_token="tok", transport=sigaa.transport) as client:
        statement = await client.restaurant.get_restaurant_statement()

    assert [r.method for r in sigaa.requests] == ["GET", "POST"]
    assert statement.balance == Decimal("0.00")
    assert statement.group == 1
    assert statement.entries[0].description == "Saldo"
    assert statement.entries[1].amount == Decimal("8.50")


async def test_get_restaurant_statement_sem_link_devolve_vazio_e_nao_faz_postback():
    sigaa = FakeDashboard(initial=DASHBOARD_SEM_NADA)
    async with SigaaClient(session_token="tok", transport=sigaa.transport) as client:
        statement = await client.restaurant.get_restaurant_statement()

    assert [r.method for r in sigaa.requests] == ["GET"]
    assert statement == RestaurantStatement()


@pytest.mark.parametrize("keep_link", [False, True])
@pytest.mark.parametrize("new_client", [False, True])
async def test_extrato_repetido_le_tabela_aberta_sem_fechar_ou_reusar_saldo(
    keep_link, new_client
):
    sigaa = FakeDashboard(keep_link=keep_link)
    async with SigaaClient(session_token="tok", transport=sigaa.transport) as client:
        first = await client.restaurant.get_restaurant_statement()
        assert first.balance == Decimal("0.00")
        for amount in ("49,50", "51,00", "40,00"):
            sigaa.statement = EXTRATO_TABLE.replace("0,00", amount)
            if new_client:
                async with SigaaClient(
                    session_token="tok", transport=sigaa.transport
                ) as other:
                    statement = await other.restaurant.get_restaurant_statement()
            else:
                statement = await client.restaurant.get_restaurant_statement()
            assert statement.balance == Decimal(amount.replace(",", "."))
            assert len(statement.entries) == 2
    assert [r.method for r in sigaa.requests] == ["GET", "POST", "GET", "GET", "GET"]


async def test_postback_sem_extrato_nao_vira_saldo_vazio():
    sigaa = FakeDashboard()
    sigaa.statement = DASHBOARD_SEM_NADA
    async with SigaaClient(session_token="tok", transport=sigaa.transport) as client:
        with pytest.raises(SigaaParseError, match="após o postback"):
            await client.restaurant.get_restaurant_statement()


def test_extrato_com_titulo_sem_tabela_e_barulhento():
    with pytest.raises(SigaaParseError, match="Tabela do extrato"):
        _statement(
            BeautifulSoup("<h4>Extrato no Restaurante Universitário</h4>", "lxml")
        )


@pytest.mark.parametrize("group", [1, 2, 3])
def test_extrato_infere_grupo_e_saldo_mais_recentes_sem_somar_movimentos(group):
    page = BeautifulSoup(
        f"""
        <h4>Extrato no Restaurante Universitário</h4><table>
        <tr><td>20/09/2026 12:00</td><td>Grupo 2 Almoço</td><td>6,10</td></tr>
        <tr><td>24/09/2026 12:00</td><td>GRUPO {group} Jantar</td><td>6,10</td></tr>
        <tr><td>25/09/2026 12:00</td><td>Saldo atual:</td><td>-1,50</td></tr>
        <tr><td>20/09/2026 12:00</td><td>Saldo</td><td>100,00</td></tr>
        </table>
    """,
        "lxml",
    )
    statement = _statement(page)
    assert statement.group == group
    assert statement.balance == Decimal("-1.50")
    assert [entry.amount for entry in statement.entries] == [
        Decimal("6.10"),
        Decimal("6.10"),
        Decimal("-1.50"),
        Decimal("100.00"),
    ]


def test_extrato_sem_movimentos_de_grupo_mantem_saldo():
    page = BeautifulSoup(
        """
        <h4>Extrato no Restaurante Universitário</h4><table>
        <tr><td>25/09/2026 22:15</td><td>Saldo</td><td>49,50</td></tr>
        <tr><td>18/09/2026 22:15</td><td>Saldo Anterior</td><td>49,50</td></tr>
        </table>
    """,
        "lxml",
    )
    statement = _statement(page)
    assert statement.balance == Decimal("49.50")
    assert statement.group is None
    assert len(statement.entries) == 2


def test_extrato_sem_saldo_ou_grupo_nao_presume_valores():
    page = BeautifulSoup(
        """
        <h4>Extrato no Restaurante Universitário</h4><table>
        <tr><td>25/09/2026 12:00</td><td>Compra de créditos</td><td>20,00</td></tr>
        </table>
    """,
        "lxml",
    )
    statement = _statement(page)
    assert statement.balance is None
    assert statement.group is None
    assert len(statement.entries) == 1


async def test_get_restaurant_credentials_le_token_e_validade():
    sigaa = FakeDashboard()
    async with SigaaClient(session_token="tok", transport=sigaa.transport) as client:
        credentials = await client.restaurant.get_restaurant_credentials()

    assert [r.method for r in sigaa.requests] == ["GET", "POST"]
    assert credentials.token == "TESTE0000000001"
    assert credentials.valid_until == date(2027, 3, 1)


async def test_get_restaurant_credentials_sem_menu_e_barulhento():
    sigaa = FakeDashboard(initial=DASHBOARD_SEM_NADA)
    async with SigaaClient(session_token="tok", transport=sigaa.transport) as client:
        with pytest.raises(SigaaParseError):
            await client.restaurant.get_restaurant_credentials()

    assert [r.method for r in sigaa.requests] == ["GET"]


def test_statement_ausente_devolve_none():
    assert _statement(BeautifulSoup(DASHBOARD, "lxml")) is None


def test_statement_parseia_data_descricao_e_valor():
    entries = _statement(BeautifulSoup(DASHBOARD_COM_EXTRATO, "lxml")).entries

    assert entries[0].description == "Saldo"
    assert entries[0].amount == Decimal("0.00")
    assert entries[1].description == "Grupo 1 Almoço"
    assert entries[1].amount == Decimal("8.50")


def test_parse_amount_le_formato_brasileiro():
    assert _parse_amount("R$ 1.234,56") == Decimal("1234.56")


def test_parse_amount_invalido_e_barulhento():
    with pytest.raises(SigaaParseError):
        _parse_amount("grátis")


def test_credentials_le_token_e_validade_do_pdf():
    credentials = _credentials(CARTEIRINHA_PDF)

    assert credentials.token == "TESTE0000000001"
    assert credentials.valid_until == date(2027, 3, 1)


def test_month_number_ignora_acento_e_caixa():
    assert _month_number("MARÇO") == 3


def test_month_number_invalido_e_barulhento():
    with pytest.raises(SigaaParseError):
        _month_number("Blursday")
