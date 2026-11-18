import re

from ..exceptions import SigaaParseError
from ..models import AcademicTranscript, TranscriptCompletion
from ..utils.pdf import extract_text

_REGISTRATION_RE = re.compile(r"Matrícula\s*:\s*(\d+)", re.IGNORECASE)
_CURRICULUM_RE = re.compile(r"Currículo\s*:\s*(\d+)\s*/\s*(-?\d+)", re.IGNORECASE)
_COURSEWORK = "Componentes Curriculares Cursados/Cursando"
_END_OF_COURSEWORK_RE = re.compile(
    r"^(?:Legenda\b|Carga Horária\b|Componentes Curriculares Obrigatórios Pendentes\b|"
    r"Equivalências\s*:|Observações\s*:)",
    re.IGNORECASE,
)
_CODE = r"[A-Z]{2,}[0-9]+"
_ROW_RE = re.compile(
    rf"^(?:\d{{4}}\.\d\s+|-+\s+)?(?:[*#@&%+]+\s*)?(?P<code>{_CODE})\s+"
    r".*\s+(?P<status>APR|APRN|CUMP|DISP)$"
)
_EQUIVALENCES_RE = re.compile(
    r"^\s*Equivalências\s*:\s*(.*?)(?=^\s*Observações\s*:|\Z)",
    re.IGNORECASE | re.MULTILINE | re.DOTALL,
)
_EQUIVALENCE_RE = re.compile(
    rf"^\s*Cumpriu\s+(?P<code>{_CODE})\s*-.*?\batravés\s+de\s+{_CODE}\b",
    re.IGNORECASE | re.MULTILINE | re.DOTALL,
)
_STATUS: dict[str, TranscriptCompletion] = {
    "APR": "approved",
    "APRN": "approved",
    "CUMP": "credit",
    "DISP": "waived",
}


def parse_transcript(pdf: bytes) -> AcademicTranscript:
    text = extract_text(pdf, layout=True)
    registration = _REGISTRATION_RE.search(text)
    curriculum = _CURRICULUM_RE.search(text)
    if registration is None or curriculum is None or _COURSEWORK not in text:
        raise SigaaParseError(
            "Matrícula, currículo ou componentes cursados ausentes no histórico acadêmico."
        )

    completed: dict[str, TranscriptCompletion] = {}
    in_coursework = False
    for line in text.splitlines():
        line = line.strip()
        if line.startswith(_COURSEWORK):
            in_coursework = True
        elif _END_OF_COURSEWORK_RE.match(line):
            in_coursework = False
        elif in_coursework and (row := _ROW_RE.match(line)):
            code, status = row.group("code", "status")
            if completed.get(code) != "approved":
                completed[code] = _STATUS[status]

    if equivalences := _EQUIVALENCES_RE.search(text):
        for match in _EQUIVALENCE_RE.finditer(equivalences[1]):
            code = match["code"].upper()
            if completed.get(code) != "approved":
                completed[code] = "equivalence"

    return AcademicTranscript(
        registration=registration[1],
        curriculum_code=f"{curriculum[1]}/{curriculum[2]}",
        completed=completed,
    )
