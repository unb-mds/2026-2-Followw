import re

from bs4 import BeautifulSoup, Tag

from ..exceptions import SigaaParseError
from ..models import EnrollmentCertificate
from ..utils.parsing import clean_text, lookup_key

_ISSUED_AT_RE = re.compile(r"Emitido em\s+(\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2})")
_COUNT_RE = re.compile(r"Turmas Matriculadas:\s*(\d+)")
_GRID_ASSIGNMENT_RE = re.compile(
    r"var\s+elem\s*=\s*document\.getElementById\(\s*"
    r"(?P<quote>['\"])(?P<cell>[1-7]_\d+)(?P=quote)\s*\)\s*;\s*"
    r"if\s*\(\s*elem\s*\)\s*elem\.innerHTML\s*=\s*"
    r"(?P<value_quote>['\"])(?P<value>[^'\"\\\r\n]*)(?P=value_quote)\s*;"
)
_GRID_CODES_RE = re.compile(r"[A-Z]+\d+(?:\s+[A-Z]+\d+)*")
_SCHEDULE_RE = re.compile(r"\b[1-7]+[MTN]\d+\b")


def _parse_enrollment_certificate(html: str) -> EnrollmentCertificate:
    soup = BeautifulSoup(html, "lxml")
    report = _required(soup, "#relatorio")
    if lookup_key(clean_text(_required(report, "h3"))) != "atestado de matricula":
        raise SigaaParseError("Título do atestado de matrícula não recebido do SIGAA.")
    issued = _ISSUED_AT_RE.search(clean_text(_required(soup, "#relatorio-cabecalho")))
    if issued is None:
        raise SigaaParseError("Data de emissão ausente no atestado de matrícula.")

    identification = []
    for row in _required(report, "#identificacao").find_all("tr"):
        cells = row.find_all("td", recursive=False)
        if not cells or len(cells) % 2:
            raise SigaaParseError("Identificação inválida no atestado de matrícula.")
        for label, value in zip(cells[::2], cells[1::2], strict=True):
            identification.append((clean_text(label).rstrip(":"), clean_text(value)))
    fields = {lookup_key(label): value for label, value in identification}
    if not all(
        fields.get(label)
        for label in (
            "nome",
            "matricula",
            "curso",
            "nivel",
            "vinculo",
            "periodo letivo",
        )
    ):
        raise SigaaParseError("Identificação incompleta no atestado de matrícula.")

    enrollment_table = _required(report, "#matriculas")
    enrollments = _table_rows(enrollment_table)
    count = _COUNT_RE.search(clean_text(report))
    if not enrollments or any(len(row) != 5 for row in enrollments):
        raise SigaaParseError("Tabela de matrículas inválida no atestado.")
    if count is None or int(count[1]) != len(enrollments) - 1:
        raise SigaaParseError("Quantidade de matrículas divergente no atestado.")

    grid = _required(report, "#horario")
    _fill_schedule(report, grid)
    schedule = _table_rows(grid, separator_columns=8)
    if len(schedule) < 2 or any(len(row) != 8 for row in schedule):
        raise SigaaParseError("Grade de horários inválida no atestado de matrícula.")
    if any(_SCHEDULE_RE.search(row[4]) for row in enrollments[1:]) and not any(
        _GRID_CODES_RE.fullmatch(cell) for row in schedule[1:] for cell in row[1:]
    ):
        raise SigaaParseError(
            "Grade de horários não preenchida no atestado de matrícula."
        )

    authentication = clean_text(_required(report, "#autenticacao p"))
    if "codigo de verificacao" not in lookup_key(authentication) or not re.search(
        r"\b[a-fA-F0-9]{10}\b", authentication
    ):
        raise SigaaParseError("Código de verificação ausente no atestado de matrícula.")

    footer = _required(soup, "#relatorio-rodape")
    for control in footer.select(".voltar, .naoImprimir"):
        control.decompose()

    return EnrollmentCertificate(
        issued_at=issued[1],
        identification=tuple(identification),
        enrollment_headers=enrollments[0],
        enrollments=enrollments[1:],
        schedule=schedule,
        authentication=authentication,
        footer=clean_text(footer),
    )


def _fill_schedule(report: Tag, grid: Tag) -> None:
    for script in report.find_all("script"):
        text = script.get_text()
        if not text.strip():
            continue
        matches = list(_GRID_ASSIGNMENT_RE.finditer(text))
        if _GRID_ASSIGNMENT_RE.sub("", text).strip():
            raise SigaaParseError("Script de horários do atestado mudou de formato.")
        for match in matches:
            cell = grid.find(id=match["cell"])
            fragment = BeautifulSoup(match["value"], "lxml")
            codes = clean_text(fragment)
            if not isinstance(cell, Tag) or not _GRID_CODES_RE.fullmatch(codes):
                raise SigaaParseError("Preenchimento de horário inválido no atestado.")
            cell.string = codes


def _table_rows(
    table: Tag, *, separator_columns: int = 0
) -> tuple[tuple[str, ...], ...]:
    rows = []
    for row in table.find_all("tr"):
        cells = tuple(
            _cell_text(cell) for cell in row.find_all(["th", "td"], recursive=False)
        )
        if any(cells):
            rows.append(cells)
        elif separator_columns and row.find("td", colspan=str(separator_columns)):
            rows.append(("",) * separator_columns)
    return tuple(rows)


def _cell_text(cell: Tag) -> str:
    if cell.select_one(".componente") is None:
        return clean_text(cell)
    lines = []
    details = []
    for part in cell.find_all("span", recursive=False):
        text = clean_text(part)
        if set(part.get("class", [])) & {"tipoComponente", "local"}:
            details.append(text)
        elif text:
            lines.append(text)
    if details:
        lines.append("   ".join(details))
    return "\n".join(lines)


def _required(root: BeautifulSoup | Tag, selector: str) -> Tag:
    node = root.select_one(selector)
    if not isinstance(node, Tag):
        raise SigaaParseError(f"Seção `{selector}` ausente no atestado de matrícula.")
    return node
