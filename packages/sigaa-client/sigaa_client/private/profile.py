import re
from urllib.parse import urljoin

from bs4 import BeautifulSoup, Tag

from ..config import DASHBOARD_PATH, SIGAA_BASE_URL
from ..exceptions import SigaaParseError
from ..models import News, UserLevel, UserProfile
from ..utils.jsf import link_params
from ..utils.parsing import clean_text, lookup_key, parse_datetime, split_course
from .session import Session

UPDATES_ID = "atualizacoes-turma"
CLASSROOM_SIGAA_ID_FIELD = "idTurma"

_INTEGRALIZATION_RE = re.compile(r"(\d+)\s*%\s*Integralizado")
_UPDATE_DATE_RE = re.compile(r"(\d{2}/\d{2}/\d{4})")
# As "Últimas Atualizações" misturam notícias com outros avisos da turma.
_NEWS_RE = re.compile(r"^Nova Notícia:\s*(.+)$")

_LEVELS = {
    "graduacao": UserLevel.GRADUACAO,
    "pos-graduacao": UserLevel.POS_GRADUACAO,
    "mestrado": UserLevel.MESTRADO,
}


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
            ira=_academic_index(fields, "ira"),
            mp=_academic_index(fields, "mp"),
            level=_level(_required(fields, "nível")),
        )

    async def list_news(self) -> list[News]:
        page = await self._session.get(DASHBOARD_PATH)
        return _parse_news(BeautifulSoup(page.text, "lxml"))


def _parse_news(soup: BeautifulSoup) -> list[News]:
    updates = soup.find("div", id=UPDATES_ID)
    # Sem turmas no semestre, o portal não desenha o painel.
    if not isinstance(updates, Tag):
        return []

    news = []
    for entry in updates.find_all("table"):
        cells = entry.find_all("td")
        if len(cells) != 2:
            raise SigaaParseError("Atualização de turma fora do formato na home.")

        title = _NEWS_RE.match(clean_text(cells[1]))
        if title is None:
            continue

        day = _UPDATE_DATE_RE.search(clean_text(cells[0]))
        anchor = cells[0].find("a")
        classroom_id = (
            link_params(anchor).get(CLASSROOM_SIGAA_ID_FIELD)
            if isinstance(anchor, Tag)
            else None
        )
        if day is None or classroom_id is None:
            raise SigaaParseError("Notícia da home sem data ou sem turma.")

        news.append(
            News(
                classroom_sigaa_id=int(classroom_id),
                title=title.group(1),
                published_on=parse_datetime(
                    day.group(1), "%d/%m/%Y", "da notícia na home"
                ).date(),
            )
        )
    return news


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


def _academic_index(fields: dict[str, str], label: str) -> float | None:
    value = fields.get(label)
    if not value:
        return None
    try:
        return float(value)
    except ValueError as error:
        raise SigaaParseError(
            f"Campo `{label}` do perfil do discente em formato inesperado."
        ) from error


def _level(value: str) -> UserLevel:
    level = _LEVELS.get(lookup_key(value))
    if level is None:
        raise SigaaParseError(f"Nível `{value}` desconhecido.")
    return level
