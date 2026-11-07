import re

from bs4 import BeautifulSoup, Tag

from ..exceptions import SigaaParseError
from ..models import SubjectDetails
from ..utils.parsing import clean_text, parse_hours

CODE_FIELD = "Código:"
NAME_FIELD = "Nome:"
UNIT_FIELD = "Unidade Responsável:"
PREREQUISITES_FIELD = "Pré-Requisitos:"
COREQUISITES_FIELD = "Co-Requisitos:"
EQUIVALENCES_FIELD = "Equivalências:"
TOTAL_HOURS_LABEL = "Total de Carga Horária do Componente"

# `DEPTO CIÊNCIAS DA COMPUTAÇÃO - BRASÍLIA - 11.01.01.15.01`: o fim é o código hierárquico.
_UNIT_RE = re.compile(r"(.+?) - \d+(?:\.\d+)*")


def parse_subject_details(
    soup: BeautifulSoup, code: str, listed_hours: int | None = None
) -> SubjectDetails:
    """Resumo do componente, igual pela busca do catálogo e pela matriz.

    `listed_hours` é a carga da listagem, que vale quando o resumo traz 0h ou nada.
    """
    table = soup.find("table", class_="visualizacao")
    if not isinstance(table, Tag):
        raise SigaaParseError("Resumo do componente não veio na tela de detalhes.")

    fields = {
        clean_text(header): cell
        for header in table.find_all("th")
        if isinstance(cell := header.find_next_sibling("td"), Tag)
    }
    for label in (
        CODE_FIELD,
        NAME_FIELD,
        PREREQUISITES_FIELD,
        COREQUISITES_FIELD,
        EQUIVALENCES_FIELD,
    ):
        if label not in fields:
            raise SigaaParseError(
                f"Campo `{label}` ausente nos detalhes do componente."
            )

    # O contexto vive na sessão: confere que a tela é do componente pedido.
    found = clean_text(fields[CODE_FIELD])
    if found != code:
        raise SigaaParseError(f"Detalhes de `{found}` onde se esperava `{code}`.")
    name = clean_text(fields[NAME_FIELD])
    if not name:
        raise SigaaParseError(f"Componente `{code}` sem nome nos detalhes.")

    return SubjectDetails(
        code=code,
        name=name,
        hours=_total_hours(soup) or listed_hours,
        unit=_unit(fields.get(UNIT_FIELD)),
        prerequisites=_expression(fields[PREREQUISITES_FIELD]),
        corequisites=_expression(fields[COREQUISITES_FIELD]),
        # O resumo traz a expressão ativa; as antigas ficam só no histórico.
        equivalences=_expression(fields[EQUIVALENCES_FIELD]),
    )


def _expression(cell: Tag) -> str | None:
    """`( ( <acronym>CIC0004</acronym> ) )` -> `( ( CIC0004 ) )`; `-` é sem requisito."""
    text = clean_text(cell)
    return None if text in ("", "-") else text


def _unit(cell: Tag | None) -> str | None:
    """O nome da unidade responsável, como em `units.csv`."""
    text = clean_text(cell) if cell is not None else ""
    match = _UNIT_RE.fullmatch(text)
    return match[1] if match else text or None


def _total_hours(soup: BeautifulSoup) -> int | None:
    for cell in soup.find_all("td"):
        if not clean_text(cell).startswith(TOTAL_HOURS_LABEL):
            continue
        value = cell.find_next_sibling("td")
        hours = parse_hours(clean_text(value)) if isinstance(value, Tag) else None
        if hours is not None:
            return hours
    return None
