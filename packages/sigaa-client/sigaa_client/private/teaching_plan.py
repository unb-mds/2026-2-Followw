from collections.abc import Iterator
from datetime import date

from bs4 import BeautifulSoup, Tag

from ..exceptions import SigaaParseError
from ..models import (
    ClassroomTeachingPlan,
    TeachingPlanAssessment,
    TeachingPlanReference,
    TeachingPlanScheduleEntry,
)
from ..utils.parsing import clean_text, parse_datetime, to_markdown

_MISSING_PLAN = "Esta turma ainda não possui um plano cadastrado."


def _parse_teaching_plan(soup: BeautifulSoup) -> ClassroomTeachingPlan | None:
    if any(
        clean_text(item) == _MISSING_PLAN for item in soup.select("#painel-erros li")
    ):
        return None

    methodology = _table(soup, "Metodologia de Ensino e Avaliação")
    return ClassroomTeachingPlan(
        methodology=_field(methodology, "Metodologia:"),
        assessment_procedures=_field(
            methodology, "Procedimentos de Avaliação da Aprendizagem:"
        ),
        office_hours=_field(methodology, "Horário de atendimento:"),
        schedule=tuple(
            TeachingPlanScheduleEntry(
                start_date=_date(cells[0]),
                end_date=_date(cells[1]),
                description=clean_text(cells[2]) or None,
            )
            for cells in _rows(_table(soup, "Cronograma de Aulas"), 3)
        ),
        assessments=tuple(
            TeachingPlanAssessment(
                date=_date(cells[0]), description=clean_text(cells[1]) or None
            )
            for cells in _rows(_table(soup, "Avaliações"), 2)
        ),
        basic_references=_references(_table(soup, "Referências Básicas")),
        complementary_references=_references(
            _table(soup, "Referências Complementares")
        ),
    )


def _table(soup: BeautifulSoup, caption: str) -> Tag:
    for title in soup.find_all("caption"):
        table = title.find_parent("table")
        if clean_text(title) == caption and isinstance(table, Tag):
            return table
    raise SigaaParseError(f"Tabela `{caption}` não encontrada no plano de ensino.")


def _field(table: Tag, label: str) -> str | None:
    for row in table.find_all("tr"):
        header, cell = row.find("th"), row.find("td")
        if (
            isinstance(header, Tag)
            and clean_text(header) == label
            and isinstance(cell, Tag)
        ):
            return to_markdown(cell)
    raise SigaaParseError(f"Campo `{label}` não encontrado no plano de ensino.")


def _rows(table: Tag, columns: int) -> Iterator[list[Tag]]:
    body = table.find("tbody", recursive=False)
    if not isinstance(body, Tag):
        raise SigaaParseError(
            f"Corpo de `{clean_text(table.caption)}` não encontrado no plano de ensino."
        )
    for row in body.find_all("tr", recursive=False):
        cells = row.find_all("td", recursive=False)
        if len(cells) != columns:
            raise SigaaParseError(
                f"Linha de `{clean_text(table.caption)}` fora do formato no plano de ensino."
            )
        yield cells


def _date(cell: Tag) -> date:
    return parse_datetime(clean_text(cell), "%d/%m/%Y", "no plano de ensino").date()


def _references(table: Tag) -> tuple[TeachingPlanReference, ...]:
    return tuple(
        TeachingPlanReference(
            material_type=clean_text(cells[0]) or None,
            description=clean_text(cells[1]) or None,
        )
        for cells in _rows(table, 2)
    )
