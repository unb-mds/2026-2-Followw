import logging
import re

from bs4 import BeautifulSoup, Tag

from ..config import DASHBOARD_PATH
from ..exceptions import SessionRenewed, SigaaParseError
from ..models import ClassroomGrade, Grade
from ..utils.jsf import build_menu_action, read_form, read_viewstate
from ..utils.parsing import clean_text
from .session import Session

GRADES_FORM_ID = "menu:form_menu_discente"
GRADES_MENU_ACTION = (
    "menu_form_menu_discente_discente_menu:A]#{ relatorioNotasAluno.gerarRelatorio }"
)
GRADES_REPORT_TITLE = "Relatório de Notas do(a) Aluno(a)"
GRADES_RESULT_LABEL = "Resultado"
_SEMESTER_RE = re.compile(r"^\d{4}\.\d$")
_NO_GRADE = ("", "-", "--")
logger = logging.getLogger(__name__)


async def read_grades(session: Session) -> list[ClassroomGrade]:
    # O relogin invalida o ViewState: refaz a leitura do portal antes do postback.
    try:
        page = await _open_grades(session, allow_renewal=True)
    except SessionRenewed:
        page = await _open_grades(session, allow_renewal=False)
    return _parse_grades(BeautifulSoup(page, "lxml"))


async def _open_grades(session: Session, allow_renewal: bool) -> str:
    page = await session.get(DASHBOARD_PATH, allow_renewal=allow_renewal)
    form = read_form(BeautifulSoup(page.text, "lxml"), GRADES_FORM_ID)
    # Falha antes do postback: sem ViewState, o SIGAA devolveria outra tela.
    read_viewstate(form)
    action, payload = build_menu_action(form, GRADES_MENU_ACTION)
    response = await session.post(action, data=payload, allow_renewal=allow_renewal)
    return response.text


def _parse_grades(soup: BeautifulSoup) -> list[ClassroomGrade]:
    title = soup.find(
        lambda tag: tag.name == "h3" and clean_text(tag) == GRADES_REPORT_TITLE
    )
    if title is None:
        raise SigaaParseError("Título do relatório de notas não encontrado.")

    grades: list[ClassroomGrade] = []
    errors: list[SigaaParseError] = []
    for table in soup.select("table.tabelaRelatorio"):
        try:
            semester_grades = _parse_semester(table)
        except SigaaParseError as error:
            errors.append(error)
            logger.warning("Tabela de notas ignorada: %s", error)
        else:
            grades.extend(semester_grades)
    if errors and not grades:
        raise errors[0]
    keys = [(grade.subject_code, grade.semester) for grade in grades]
    if len(keys) != len(set(keys)):
        raise SigaaParseError("Disciplina e semestre duplicados no relatório de notas.")
    return grades


def _parse_semester(table: Tag) -> list[ClassroomGrade]:
    caption = table.find("caption")
    semester = clean_text(caption) if caption else ""
    if not _SEMESTER_RE.fullmatch(semester):
        raise SigaaParseError("Semestre ausente ou inválido no relatório de notas.")
    header = table.find("tr")
    labels = [clean_text(cell) for cell in header.find_all("th")] if header else []
    if labels[:2] != ["Código", "Disciplina"] or GRADES_RESULT_LABEL not in labels:
        raise SigaaParseError(
            f"Colunas de código, disciplina ou resultado ausentes nas notas de `{semester}`."
        )
    # Avaliações podem faltar ou ter colspan; Resultado fica a uma distância fixa do fim.
    from_end = len(labels) - labels.index(GRADES_RESULT_LABEL)
    grades: list[ClassroomGrade] = []
    seen: set[str] = set()
    for row in table.find_all("tr"):
        if row is header or row.find_parent("table") is not table:
            continue
        cells = row.find_all("td", recursive=False)
        if len(cells) < 2 + from_end:
            raise SigaaParseError(
                f"Linha de notas incompleta no semestre `{semester}`."
            )
        code = clean_text(cells[0])
        if not code or code in seen:
            raise SigaaParseError(
                f"Código ausente ou duplicado nas notas de `{semester}`."
            )
        seen.add(code)
        grades.append(
            ClassroomGrade(
                subject_code=code,
                semester=semester,
                grade=_grade(clean_text(cells[-from_end])),
            )
        )
    return grades


def _grade(value: str) -> Grade | None:
    if value in _NO_GRADE:
        return None
    try:
        return Grade(value)
    except ValueError:
        raise SigaaParseError(f"Menção `{value}` desconhecida nas notas.") from None
