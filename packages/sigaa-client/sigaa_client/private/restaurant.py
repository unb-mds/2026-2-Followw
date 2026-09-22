import re
from datetime import date, datetime
from decimal import Decimal

from bs4 import BeautifulSoup, Tag

from ..config import DASHBOARD_PATH
from ..exceptions import SigaaParseError
from ..models import RestaurantCredentials, RestaurantStatementEntry
from ..utils.jsf import build_menu_action, build_postback, link_params, read_viewstate
from ..utils.parsing import clean_text, lookup_key
from ..utils.pdf import extract_text, find_qr_code
from .session import Session

# Postback que expande o extrato do RU dentro da própria página do dashboard.
_STATEMENT_FORM_ID = "formExibirExtrato"
_STATEMENT_TITLE = "Extrato no Restaurante Universitário"

# Postback do menu lateral que gera o PDF da carteirinha estudantil.
_STUDENT_CARD_MENU_FORM_ID = "menu:form_menu_discente"
_STUDENT_CARD_MENU_ACTION = (
    "menu_form_menu_discente_discente_menu:A]"
    "#{ portalDiscente.emitiCarteiraEstudantilUnb }"
)

_VALIDITY_RE = re.compile(r"VALIDADE\s+(\w+)\s+(\d{4})", re.IGNORECASE)

_MONTHS = {
    "janeiro": 1,
    "fevereiro": 2,
    "marco": 3,
    "abril": 4,
    "maio": 5,
    "junho": 6,
    "julho": 7,
    "agosto": 8,
    "setembro": 9,
    "outubro": 10,
    "novembro": 11,
    "dezembro": 12,
}


class Restaurant:
    def __init__(self, session: Session) -> None:
        self._session = session

    async def get_restaurant_statement(
        self,
    ) -> tuple[RestaurantStatementEntry, ...] | None:
        """`None` quando o discente não tem extrato do RU pra mostrar.

        Custa um GET (pelo `ViewState` atual) + o POST do postback que abre
        o extrato — não dá pra economizar isso: o `ViewState` morre a cada
        postback, então não há como reaproveitar o de outra chamada.
        """
        page = await self._session.get(DASHBOARD_PATH)
        soup = BeautifulSoup(page.text, "lxml")

        form = soup.find("form", id=_STATEMENT_FORM_ID)
        anchor = form.find("a") if isinstance(form, Tag) else None
        if not (isinstance(form, Tag) and isinstance(anchor, Tag)):
            return None

        action, payload = build_postback(
            form, link_params(anchor), read_viewstate(soup)
        )
        page = await self._session.post(action, data=payload)
        return _statement(BeautifulSoup(page.text, "lxml"))

    async def get_restaurant_credentials(self) -> RestaurantCredentials:
        """Token do QR code e validade da carteirinha estudantil (lida no RU)."""
        page = await self._session.get(DASHBOARD_PATH)
        soup = BeautifulSoup(page.text, "lxml")

        form = soup.find("form", id=_STUDENT_CARD_MENU_FORM_ID)
        if not isinstance(form, Tag):
            raise SigaaParseError("Menu do discente não encontrado no portal.")

        action, payload = build_menu_action(form, _STUDENT_CARD_MENU_ACTION)
        response = await self._session.post(action, data=payload)

        return _credentials(response.content)


def _statement(page: BeautifulSoup) -> tuple[RestaurantStatementEntry, ...] | None:
    heading = page.find(
        lambda tag: tag.name == "h4" and _STATEMENT_TITLE in clean_text(tag)
    )
    table = heading.find_next("table") if isinstance(heading, Tag) else None
    if table is None:
        return None

    entries = []
    for row in table.find_all("tr"):
        cells = row.find_all("td")
        if len(cells) != 3:
            continue
        entries.append(
            RestaurantStatementEntry(
                occurred_at=_parse_datetime(clean_text(cells[0])),
                description=clean_text(cells[1]),
                amount=_parse_amount(clean_text(cells[2])),
            )
        )
    return tuple(entries)


def _parse_datetime(value: str) -> datetime:
    try:
        # O SIGAA não expõe timezone; o horário é sempre o de Brasília.
        return datetime.strptime(value, "%d/%m/%Y %H:%M")  # noqa: DTZ007
    except ValueError as error:
        raise SigaaParseError(
            f"Data `{value}` do extrato do RU em formato inesperado."
        ) from error


def _parse_amount(value: str) -> Decimal:
    try:
        return Decimal(
            value.removeprefix("R$").strip().replace(".", "").replace(",", ".")
        )
    except ArithmeticError as error:
        raise SigaaParseError(
            f"Valor `{value}` do extrato do RU em formato inesperado."
        ) from error


def _credentials(pdf: bytes) -> RestaurantCredentials:
    token = find_qr_code(pdf)
    if token is None:
        raise SigaaParseError("QR code não encontrado na carteirinha estudantil.")

    match = _VALIDITY_RE.search(extract_text(pdf))
    if match is None:
        raise SigaaParseError("Validade não encontrada na carteirinha estudantil.")

    return RestaurantCredentials(
        token=token,
        valid_until=date(int(match.group(2)), _month_number(match.group(1)), 1),
    )


def _month_number(value: str) -> int:
    month = _MONTHS.get(lookup_key(value))
    if month is None:
        raise SigaaParseError(f"Mês `{value}` desconhecido na carteirinha estudantil.")
    return month
