import re

from ..exceptions import SigaaParseError
from ..utils.pdf import extract_text

_REGISTRATION_RE = re.compile(r"Matrícula\s*:\s*(\d+)", re.IGNORECASE)
_COURSEWORK = "Componentes Curriculares Cursados/Cursando"
_END_OF_COURSEWORK_RE = re.compile(
    r"^(?:Legenda\b|Carga Horária\b|Componentes Curriculares Obrigatórios Pendentes\b|"
    r"Equivalências\s*:|Observações\s*:)",
    re.IGNORECASE,
)
_CUMP_ROW_RE = re.compile(
    r"^(?:\d{4}\.\d\s+|-+\s+)?(?:[*#@&%+]+\s*)?(?P<code>[A-Z]{2,}[0-9]+)\s+.*\s+CUMP$"
)


def parse_completed_subjects(pdf: bytes, registration: str) -> set[str]:
    text = extract_text(pdf, layout=True)
    found = _REGISTRATION_RE.search(text)
    if found is None or _COURSEWORK not in text:
        raise SigaaParseError(
            "Matrícula ou componentes cursados ausentes no histórico acadêmico."
        )
    if found[1] != registration:
        raise SigaaParseError("Matrícula do histórico acadêmico não confere.")

    completed: set[str] = set()
    in_coursework = False
    for line in text.splitlines():
        line = line.strip()
        if line.startswith(_COURSEWORK):
            in_coursework = True
        elif _END_OF_COURSEWORK_RE.match(line):
            in_coursework = False
        elif in_coursework and (row := _CUMP_ROW_RE.match(line)):
            completed.add(row["code"])
    return completed
