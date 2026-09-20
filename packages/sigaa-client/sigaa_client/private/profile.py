import re
import unicodedata
from datetime import datetime
from decimal import Decimal
from urllib.parse import urljoin

from bs4 import BeautifulSoup, Tag

from ..config import DASHBOARD_PATH, SIGAA_BASE_URL
from ..exceptions import SigaaParseError
from ..models import RestaurantStatementEntry, UserLevel, UserProfile
from ..utils.jsf import build_postback, link_params, read_viewstate
from ..utils.parsing import clean_text, split_course
from .session import Session

_INTEGRALIZATION_RE = re.compile(r"(\d+)\s*%\s*Integralizado")

_LEVELS = {
    "graduacao": UserLevel.GRADUACAO,
    "pos-graduacao": UserLevel.POS_GRADUACAO,
    "mestrado": UserLevel.MESTRADO,
}

# Postback que expande o extrato do RU dentro da própria página do dashboard.
_RESTAURANT_STATEMENT_FORM_ID = "formExibirExtrato"
_RESTAURANT_STATEMENT_TITLE = "Extrato no Restaurante Universitário"


class Profile:
    def __init__(self, session: Session) -> None:
        self._session = session

    async def get_profile(self) -> UserProfile:
        page = await self._session.get(DASHBOARD_PATH)
        card = BeautifulSoup(page.text, "lxml").select_one("#perfil-docente")
        if card is None:
            raise SigaaParseError(
                "Bloco de perfil não encontrado no portal do discente."
            )

        fields = _labeled_fields(card)
        raw_course = _required(fields, "curso")
        course, unity = split_course(raw_course)
        if unity is None:
            raise SigaaParseError(f"Curso `{raw_course}` não traz a unidade.")

        return UserProfile(
            name=_name(card),
            registration=_required(fields, "matrícula"),
            photo=_photo(card),
            bio=_bio(card),
            unity=unity,
            course=course,
            integralization=_integralization(card),
            level=_level(_required(fields, "nível")),
        )

    async def get_restaurant_statement(
        self,
    ) -> tuple[RestaurantStatementEntry, ...] | None:
        """`None` quando o discente não tem extrato do RU pra mostrar.

        Custa um GET (pelo `ViewState` atual) + o POST do postback que abre
        o extrato — não dá pra economizar isso: o `ViewState` morre a cada
        postback, então não há como reaproveitar o de `get_profile`.
        """
        page = await self._session.get(DASHBOARD_PATH)
        soup = BeautifulSoup(page.text, "lxml")

        form = soup.find("form", id=_RESTAURANT_STATEMENT_FORM_ID)
        anchor = form.find("a") if isinstance(form, Tag) else None
        if not (isinstance(form, Tag) and isinstance(anchor, Tag)):
            return None

        action, payload = build_postback(
            form, link_params(anchor), read_viewstate(soup)
        )
        page = await self._session.post(action, data=payload)
        return _restaurant_statement(BeautifulSoup(page.text, "lxml"))


def _labeled_fields(card: Tag) -> dict[str, str]:
    fields: dict[str, str] = {}
    for row in card.select("table tr"):
        cells = row.find_all("td", recursive=False)
        if len(cells) != 2:
            continue
        label = clean_text(cells[0]).rstrip(":").strip().lower()
        if label:
            fields[label] = clean_text(cells[1])
    return fields


def _required(fields: dict[str, str], label: str) -> str:
    value = fields.get(label)
    if not value:
        raise SigaaParseError(f"Campo `{label}` ausente no perfil do discente.")
    return value


def _name(card: Tag) -> str:
    name = card.select_one(".info-docente .nome")
    if name is None:
        raise SigaaParseError("Nome não encontrado no perfil do discente.")
    return clean_text(name)


def _bio(card: Tag) -> str | None:
    info = card.select_one(".info-docente")
    if info is None:
        return None
    text = clean_text(info).removeprefix(_name(card)).strip()
    return text or None


def _photo(card: Tag) -> str | None:
    photo = card.select_one(".foto img")
    if photo is None:
        return None
    src = photo.get("src")
    return urljoin(SIGAA_BASE_URL, str(src)) if src else None


def _integralization(card: Tag) -> int | None:
    match = _INTEGRALIZATION_RE.search(clean_text(card))
    return int(match.group(1)) if match else None


def _level(value: str) -> UserLevel:
    key = unicodedata.normalize("NFKD", value.strip().lower())
    key = "".join(c for c in key if not unicodedata.combining(c))
    level = _LEVELS.get(key)
    if level is None:
        raise SigaaParseError(f"Nível `{value}` desconhecido.")
    return level


def _restaurant_statement(
    page: BeautifulSoup,
) -> tuple[RestaurantStatementEntry, ...] | None:
    heading = page.find(
        lambda tag: tag.name == "h4" and _RESTAURANT_STATEMENT_TITLE in clean_text(tag)
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
