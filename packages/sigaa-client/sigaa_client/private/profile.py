import re

from bs4 import BeautifulSoup, Tag

from ..config import DASHBOARD_PATH
from ..exceptions import SigaaParseError
from ..models import CurriculumWorkload, UserLevel, UserProfile
from ..utils.parsing import (
    clean_text,
    course_shift,
    lookup_key,
    photo_url,
    split_course,
)
from .session import Session

_INTEGRALIZATION_RE = re.compile(r"(\d+)\s*%\s*Integralizado")
_SEMESTER_RE = re.compile(r"\d{4}\.[1-9]")

_WORKLOAD_LABELS = {
    "total": "ch. total currículo",
    "pending_mandatory": "ch. obrigatória pendente",
    "pending_optional": "ch. optativa pendente",
    "pending_complementary": "ch. complementar pendente",
}

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
        course, unit = split_course(raw_course)
        if unit is None:
            raise SigaaParseError(f"Curso `{raw_course}` não traz a unidade.")

        return UserProfile(
            name=_name(card),
            registration=_required(fields, "matrícula"),
            photo=_photo(card),
            bio=_bio(card),
            unit=unit,
            course=course,
            shift=course_shift(raw_course),
            entry_semester=_entry_semester(fields),
            integralization=_integralization(card),
            workload=_workload(fields),
            ira=_academic_index(fields, "ira"),
            mp=_academic_index(fields, "mp"),
            level=_level(_required(fields, "nível")),
        )


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
    return photo_url(str(photo.get("src") or ""))


def _integralization(card: Tag) -> int | None:
    match = _INTEGRALIZATION_RE.search(clean_text(card))
    return int(match.group(1)) if match else None


def _entry_semester(fields: dict[str, str]) -> str | None:
    value = fields.get("entrada")
    if not value:
        return None
    if not _SEMESTER_RE.fullmatch(value):
        raise SigaaParseError(f"Entrada `{value}` do perfil fora do formato AAAA.P.")
    return value


def _workload(fields: dict[str, str]) -> CurriculumWorkload | None:
    values = {key: fields.get(label) for key, label in _WORKLOAD_LABELS.items()}
    # Sem o bloco de integralizações (ex.: pós-graduação), não há o que agrupar.
    if not any(values.values()):
        return None
    if not all(value and value.isdigit() for value in values.values()):
        raise SigaaParseError(
            "Cargas horárias incompletas ou fora do formato no perfil."
        )
    return CurriculumWorkload.model_validate(values)


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
