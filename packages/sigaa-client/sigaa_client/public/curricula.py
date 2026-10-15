import re

from bs4 import BeautifulSoup, Tag

from ..config import PUBLIC_CURRICULA_PATH
from ..exceptions import SessionExpired, SigaaParseError, SigaaSearchError
from ..models import Curriculum, CurriculumPeriod, CurriculumSummary
from ..utils.jsf import build_postback, link_params, read_form, read_viewstate
from ..utils.parsing import clean_text, lookup_key
from .session import PublicSession

FORM_ID = "formCurriculosCurso"
DETAIL_TITLE = "Visualizar Estrutura Curricular"
_SUMMARY_RE = re.compile(r"Detalhes da Estrutura Curricular (.+), Criado em (\d{4})")
_PERIOD_RE = re.compile(r"semestre(\d+)$")
_SUBJECT_RE = re.compile(r"(\S+) - .+ - \d+h$")
_SEMESTER_RE = re.compile(r"\d{4}\.\d")
_COUNT_RE = re.compile(r"(\d+) estruturas curriculares disponiveis")
_SHIFT_SEPARATOR_RE = re.compile(r"\s*(?:,|\be\b)\s*")
_SHIFT_NAMES = {"matutino", "vespertino", "noturno", "integral"}


def _parse_shift(text: str) -> str | None:
    label = lookup_key(text).rsplit(" - ", 1)[-1]
    if label in {"", "turno indefinido"}:
        return None
    shifts = set(_SHIFT_SEPARATOR_RE.split(label))
    if not shifts <= _SHIFT_NAMES:
        raise SigaaParseError(f"Turno desconhecido na lista de currículos: {text}.")
    return "N" if "noturno" in shifts else "D"


class PublicCurricula:
    def __init__(self, session: PublicSession) -> None:
        self._session = session

    async def list_curricula(self, course_sigaa_id: int) -> list[CurriculumSummary]:
        return [
            item
            for item, _ in _parse_list(
                await self._open(course_sigaa_id), course_sigaa_id
            )
        ]

    async def get_curriculum(self, course_sigaa_id: int, sigaa_id: int) -> Curriculum:
        for attempt in range(2):
            try:
                soup = await self._open(course_sigaa_id)
                entries = _parse_list(soup, course_sigaa_id)
                for summary, anchor in entries:
                    if summary.sigaa_id == sigaa_id:
                        form = read_form(soup, FORM_ID)
                        action, payload = build_postback(
                            form, link_params(anchor), read_viewstate(form)
                        )
                        return _parse_details(
                            await self._session.submit(action, payload), summary
                        )
                raise SigaaSearchError(
                    f"Currículo {sigaa_id} não encontrado no curso {course_sigaa_id}."
                )
            except SessionExpired:
                if attempt:
                    raise
                await self._session.restart()
        raise AssertionError("Retentativa de currículo esgotada")

    async def _open(self, course_sigaa_id: int) -> BeautifulSoup:
        if course_sigaa_id <= 0:
            raise SigaaSearchError("O id do curso deve ser positivo.")
        return await self._session.open(
            f"{PUBLIC_CURRICULA_PATH}?lc=pt_BR&id={course_sigaa_id}"
        )


def _parse_list(
    soup: BeautifulSoup, course_id: int
) -> list[tuple[CurriculumSummary, Tag]]:
    form = read_form(soup, FORM_ID)
    table = form.find("table", id="table_lt")
    if not isinstance(table, Tag):
        raise SigaaParseError(f"Tabela de currículos ausente no curso {course_id}.")
    entries = []
    shift = None
    for row in table.find_all("tr"):
        cells = row.find_all("td", recursive=False)
        if "campos" in row.get("class", []):
            shift = _parse_shift(clean_text(row))
            continue
        if not cells or len(cells) == 1:
            continue
        anchor = row.find("a", title=DETAIL_TITLE)
        match = _SUMMARY_RE.fullmatch(clean_text(cells[0]))
        identifier = (
            link_params(anchor).get("id", "") if isinstance(anchor, Tag) else ""
        )
        status = lookup_key(clean_text(cells[1]))
        if (
            not match
            or not identifier.isdigit()
            or int(identifier) <= 0
            or status not in {"ativa", "inativa"}
        ):
            raise SigaaParseError(
                f"Linha de currículo inválida no curso {course_id}: {clean_text(row)}"
            )
        entries.append(
            (
                CurriculumSummary(
                    sigaa_id=int(identifier),
                    course_sigaa_id=course_id,
                    code=match[1],
                    created_year=int(match[2]),
                    active=status == "ativa",
                    shift=shift,
                ),
                anchor,
            )
        )
    count = _COUNT_RE.search(lookup_key(clean_text(table)))
    if not count or int(count[1]) != len(entries):
        raise SigaaParseError(
            f"Contagem da lista de currículos ausente ou divergente no curso {course_id}."
        )
    return entries


def _parse_details(soup: BeautifulSoup, summary: CurriculumSummary) -> Curriculum:
    form = read_form(soup, "formulario")
    metadata = {}
    for row in form.select("table.formulario > tr, table.formulario > tbody > tr"):
        label = row.find("th", recursive=False)
        value = row.find("td", recursive=False)
        if label and value:
            metadata[lookup_key(clean_text(label)).rstrip(":")] = clean_text(value)
    code = metadata.get("codigo")
    semester = metadata.get("periodo letivo de entrada em vigor", "")
    matrix = metadata.get("matriz curricular", "")
    if code != summary.code or not _SEMESTER_RE.fullmatch(semester) or not matrix:
        raise SigaaParseError(
            f"Código, matriz ou vigência inválidos nos detalhes do currículo {summary.sigaa_id}."
        )
    optional = _parse_subjects(form, "optativas", "optativa")
    complementary = _parse_subjects(form, "complementares", "complementar")
    periods = []
    for section in form.find_all("div", id=_PERIOD_RE):
        period = int(_PERIOD_RE.fullmatch(section["id"])[1])
        periods.append(
            CurriculumPeriod(
                period=period,
                required=_parse_subjects(form, section["id"], "obrigatoria"),
            )
        )
        optional += _parse_subjects(form, section["id"], "optativa")
    if not periods:
        raise SigaaParseError(f"Períodos ausentes no currículo {summary.sigaa_id}.")
    return Curriculum(
        **summary.model_dump(),
        valid_from=semester,
        matrix=matrix,
        required_by_period=tuple(sorted(periods, key=lambda item: item.period)),
        optional=tuple(dict.fromkeys(optional)),
        complementary=complementary,
    )


def _parse_subjects(form: Tag, section_id: str, expected: str) -> tuple[str, ...]:
    section = form.find("div", id=section_id)
    if not isinstance(section, Tag) or section.find("table") is None:
        raise SigaaParseError(f"Seção {section_id} ausente nos detalhes do currículo.")
    codes = []
    for row in section.find_all("tr"):
        cells = row.find_all("td", recursive=False)
        if (
            len(cells) == 1
            and cells[0].get("colspan") == "3"
            and "carga horaria total" in lookup_key(clean_text(cells[0]))
        ):
            continue
        if not cells:
            continue
        match = _SUBJECT_RE.fullmatch(clean_text(cells[0]))
        kind = lookup_key(clean_text(cells[1])) if len(cells) > 1 else ""
        if (
            len(cells) != 3
            or not match
            or kind not in {"obrigatoria", "optativa", "complementar"}
        ):
            raise SigaaParseError(
                f"Componente inválido em {section_id}: {clean_text(row)}"
            )
        if kind == expected:
            codes.append(match[1])
    return tuple(dict.fromkeys(codes))
