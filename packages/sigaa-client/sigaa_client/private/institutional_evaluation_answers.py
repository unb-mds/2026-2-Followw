import re
from collections.abc import Mapping
from urllib.parse import urlsplit

from bs4 import BeautifulSoup, Tag

from ..config import INSTITUTIONAL_EVALUATION_QUESTIONNAIRE_PATH, SIGAA_BASE_URL
from ..exceptions import (
    InstitutionalEvaluationInvalidAnswer,
    InstitutionalEvaluationRejected,
    SigaaParseError,
)
from ..models import InstitutionalQuestionnaire
from ..utils.jsf import build_link_submit
from ..utils.parsing import clean_text, lookup_key

_MAX_COMMENT_LENGTH = 600
_FINALIZED_RE = re.compile(
    r"\b(?:finalizad|concluid|respondid|preenchid|enviad|realizad|registrad)[ao]s?\b"
)


def normalize_answers(
    questionnaire: InstitutionalQuestionnaire, answers: Mapping[str, str | None]
) -> dict[str, str]:
    options = {
        question.field: {"", *(choice.value for choice in question.choices)}
        for target in questionnaire.targets
        for question in target.questions
    }
    options.update(
        {
            comment.instructor_field: {
                choice.value for choice in comment.instructor_choices
            }
            for comment in questionnaire.comments
            if comment.instructor_field is not None
        }
    )
    comments = {comment.field for comment in questionnaire.comments}
    values = {}
    for field, value in answers.items():
        if value is not None and not isinstance(value, str):
            raise InstitutionalEvaluationInvalidAnswer(
                f"Use um texto ou None para o campo `{field}`."
            )
        value = _normalize_text(value or "")
        if field in comments:
            if len(value.encode("utf-16-le")) // 2 > _MAX_COMMENT_LENGTH:
                raise InstitutionalEvaluationInvalidAnswer(
                    f"O comentário `{field}` deve ter até 600 caracteres."
                )
        elif field not in options:
            raise InstitutionalEvaluationInvalidAnswer(
                f"Campo `{field}` ausente do questionário da avaliação."
            )
        elif value not in options[field]:
            raise InstitutionalEvaluationInvalidAnswer(
                f"Opção inválida para o campo `{field}` da avaliação."
            )
        values[field] = value
    return values


def reflects_answers(
    questionnaire: InstitutionalQuestionnaire, values: dict[str, str]
) -> bool:
    saved = {
        question.field: question.answer or ""
        for target in questionnaire.targets
        for question in target.questions
    }
    for comment in questionnaire.comments:
        saved[comment.field] = _normalize_text(comment.text or "")
        if comment.instructor_field is not None:
            saved[comment.instructor_field] = comment.instructor_answer or ""
    return all(saved.get(field) == value for field, value in values.items())


def build_evaluation_submit(
    form: Tag, command: str, values: dict[str, str]
) -> tuple[str, dict[str, str]]:
    link = next(
        (
            link
            for link in form.select("table.botoes a[onclick]")
            if clean_text(link) == command
        ),
        None,
    )
    if link is None:
        raise SigaaParseError(f"Ação `{command}` ausente no questionário da avaliação.")
    action, payload = build_link_submit(form, link, values)
    url = urlsplit(action)
    endpoint = f"{url.scheme}://{url.netloc}{url.path.split(';', 1)[0]}"
    if endpoint != f"{SIGAA_BASE_URL}{INSTITUTIONAL_EVALUATION_QUESTIONNAIRE_PATH}":
        raise SigaaParseError("Destino inesperado no envio da avaliação institucional.")
    return action, payload


def read_write_confirmation(page: BeautifulSoup) -> str | None:
    errors = " ".join(
        clean_text(item) for item in page.select("ul.erros li, #painel-erros .erro")
    ).strip()
    if errors:
        raise InstitutionalEvaluationRejected(errors)
    return next(
        (
            message
            for item in page.select(
                "ul.sucesso li, #painel-erros .info, ul.info li, .mensagem-sucesso"
            )
            if (message := clean_text(item))
            and _confirms_finalization(lookup_key(message))
        ),
        None,
    )


def _confirms_finalization(message: str) -> bool:
    return (
        ("avaliacao" in message or "resposta" in message)
        and "nao" not in message.split()
        and _FINALIZED_RE.search(message) is not None
    )


def _normalize_text(value: str) -> str:
    return value.replace("\r\n", "\n").replace("\r", "\n")
