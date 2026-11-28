import re

from bs4 import BeautifulSoup, Tag

from ..exceptions import SigaaParseError
from ..models import (
    InstitutionalEvaluation,
    InstitutionalEvaluationChoice,
    InstitutionalEvaluationComment,
    InstitutionalEvaluationQuestion,
    InstitutionalEvaluationTarget,
    InstitutionalQuestionnaire,
)
from ..utils.jsf import option_value, selected_value
from ..utils.parsing import clean_text, to_markdown

_QUESTIONNAIRE_TITLE = "Questionário da Avaliação da Docência pelo Aluno"
_CLASSROOM_LINK_SELECTOR = 'a[onclick^="PainelTurma.show("]'
_CLASSROOM_ID_RE = re.compile(r"PainelTurma\.show\((\d+)\)")
_INSTRUCTOR_PREFIX_RE = re.compile(r"^\d+\s*-\s*")


def parse_questionnaire(
    page: BeautifulSoup, evaluation: InstitutionalEvaluation
) -> InstitutionalQuestionnaire:
    form = read_questionnaire_form(page)
    instructions = form.select_one(".descricaoOperacao")
    return InstitutionalQuestionnaire(
        evaluation=evaluation,
        instructions=to_markdown(instructions) if instructions is not None else None,
        targets=_parse_targets(form),
        comments=_parse_comments(form),
    )


def read_questionnaire_form(page: BeautifulSoup) -> Tag:
    form = page.select_one("#conteudo form#form")
    heading = form.select_one("h2") if form is not None else None
    if heading is None or not clean_text(heading).endswith(_QUESTIONNAIRE_TITLE):
        raise SigaaParseError(
            "Tela de questionário da avaliação institucional ausente."
        )

    return form


def _parse_targets(form: Tag) -> tuple[InstitutionalEvaluationTarget, ...]:
    questions_by_target: dict[
        tuple[int, str, str], list[InstitutionalEvaluationQuestion]
    ] = {}
    for block in form.select('[id^="dimensoes-avaliacao-"] .aba'):
        columns: dict[int, tuple[int, str, str]] = {}
        for row in block.select(":scope > table tr"):
            cells = row.find_all("td", recursive=False)
            if "pergunta" in row.get("class", []):
                if not columns:
                    raise SigaaParseError(
                        "Pergunta sem cabeçalho de turmas na avaliação."
                    )
                for index, question in _parse_questions(cells).items():
                    if index not in columns:
                        raise SigaaParseError(
                            "Campo de resposta sem turma na avaliação."
                        )
                    questions_by_target.setdefault(columns[index], []).append(question)
            elif row.select_one(_CLASSROOM_LINK_SELECTOR):
                columns = _parse_columns(cells)

    if not questions_by_target:
        raise SigaaParseError(
            "Perguntas por turma ausentes no questionário da avaliação."
        )
    return tuple(
        InstitutionalEvaluationTarget(
            classroom_sigaa_id=classroom_id,
            classroom_label=label,
            instructor=_INSTRUCTOR_PREFIX_RE.sub("", instructor),
            questions=tuple(questions),
        )
        for (classroom_id, label, instructor), questions in questions_by_target.items()
    )


def _parse_columns(cells: list[Tag]) -> dict[int, tuple[int, str, str]]:
    links = [cell.select_one(_CLASSROOM_LINK_SELECTOR) for cell in cells]
    if classroom := links[0]:
        return {
            index: _target(classroom, instructor)
            for index, cell in enumerate(cells[1:], start=1)
            if (instructor := cell.select_one("acronym[title]")) is not None
        }
    return {
        index: _target(link, link)
        for index, link in enumerate(links)
        if link is not None
    }


def _target(classroom: Tag, instructor: Tag) -> tuple[int, str, str]:
    classroom_id = _CLASSROOM_ID_RE.fullmatch(str(classroom.get("onclick", "")))
    label = clean_text(classroom)
    name = str(instructor.get("title", "")).strip()
    if classroom_id is None or not label or not _INSTRUCTOR_PREFIX_RE.sub("", name):
        raise SigaaParseError("Turma ou docente ausente no cabeçalho da avaliação.")
    return int(classroom_id[1]), label, name


def _parse_questions(cells: list[Tag]) -> dict[int, InstitutionalEvaluationQuestion]:
    prompt = clean_text(cells[0]) if cells else ""
    questions = {
        index: InstitutionalEvaluationQuestion(
            prompt=prompt,
            field=_field_name(select),
            choices=_read_choices(select),
            answer=selected_value(select) or None,
        )
        for index, cell in enumerate(cells[1:], start=1)
        if (select := cell.select_one("select")) is not None
    }
    if (
        not prompt
        or not questions
        or any(not question.choices for question in questions.values())
    ):
        raise SigaaParseError(
            "Enunciado ou opções ausentes no questionário da avaliação."
        )
    return questions


def _read_choices(select: Tag) -> tuple[InstitutionalEvaluationChoice, ...]:
    return tuple(
        InstitutionalEvaluationChoice(value=value, label=label)
        for option in select.select("option:not([disabled])")
        if (value := option_value(option)) != "" and (label := clean_text(option))
    )


def _field_name(field: Tag) -> str:
    name = str(field.get("name", "")).strip()
    if not name:
        raise SigaaParseError(
            "Campo sem nome no formulário da avaliação institucional."
        )
    return name


def _parse_comments(form: Tag) -> tuple[InstitutionalEvaluationComment, ...]:
    comments = []
    for field in form.select("#comentario textarea"):
        cell = field.find_parent("td")
        if cell is None:
            heading = field.find_previous_sibling("h5")
            label = clean_text(heading) if heading is not None else ""
            select = None
        else:
            label = " ".join(
                " ".join(cell.find_all(string=True, recursive=False)).split()
            )
            select = cell.select_one("select")
        if not label:
            raise SigaaParseError("Rótulo ausente nos comentários da avaliação.")
        comments.append(
            InstitutionalEvaluationComment(
                label=label,
                field=_field_name(field),
                text=field.get_text() or None,
                instructor_field=_field_name(select) if select is not None else None,
                instructor_answer=(selected_value(select) or None)
                if select is not None
                else None,
                instructor_choices=_read_choices(select) if select is not None else (),
            )
        )
    return tuple(comments)
