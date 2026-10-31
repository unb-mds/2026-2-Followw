from bs4 import BeautifulSoup, Tag

from ..exceptions import SigaaParseError
from ..models import Subject, SubjectDetails
from ..utils.parsing import clean_text, parse_hours

CODE_FIELD = "Código:"
PREREQUISITES_FIELD = "Pré-Requisitos:"
COREQUISITES_FIELD = "Co-Requisitos:"
EQUIVALENCES_FIELD = "Equivalências:"
TOTAL_HOURS_LABEL = "Total de Carga Horária do Componente"


def parse_subject_details(soup: BeautifulSoup, subject: Subject) -> SubjectDetails:
    """Resumo do componente, igual na turma e no catálogo público."""
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
        PREREQUISITES_FIELD,
        COREQUISITES_FIELD,
        EQUIVALENCES_FIELD,
    ):
        if label not in fields:
            raise SigaaParseError(
                f"Campo `{label}` ausente nos detalhes do componente."
            )

    # O contexto vive na sessão: confere que a tela é do componente pedido.
    code = clean_text(fields[CODE_FIELD])
    if code != subject.code:
        raise SigaaParseError(
            f"Detalhes de `{code}` onde se esperava `{subject.code}`."
        )

    return SubjectDetails(
        **subject.model_dump(include=set(Subject.model_fields), exclude={"hours"}),
        hours=_total_hours(soup) or subject.hours,
        prerequisites=_expression(fields[PREREQUISITES_FIELD]),
        corequisites=_expression(fields[COREQUISITES_FIELD]),
        # O resumo traz a expressão ativa; as antigas ficam só no histórico.
        equivalences=_expression(fields[EQUIVALENCES_FIELD]),
    )


def _expression(cell: Tag) -> str | None:
    """`( ( <acronym>CIC0004</acronym> ) )` -> `( ( CIC0004 ) )`; `-` é sem requisito."""
    text = clean_text(cell)
    return None if text in ("", "-") else text


def _total_hours(soup: BeautifulSoup) -> int | None:
    for cell in soup.find_all("td"):
        if not clean_text(cell).startswith(TOTAL_HOURS_LABEL):
            continue
        value = cell.find_next_sibling("td")
        hours = parse_hours(clean_text(value)) if isinstance(value, Tag) else None
        if hours is not None:
            return hours
    return None
