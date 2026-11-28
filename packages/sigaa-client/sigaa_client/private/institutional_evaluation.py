import re
from asyncio import Lock
from collections.abc import Mapping

import httpx
from bs4 import BeautifulSoup, Tag

from ..config import DASHBOARD_PATH
from ..exceptions import (
    InstitutionalEvaluationNotFound,
    InstitutionalEvaluationWriteUnconfirmed,
    SessionExpired,
    SessionRenewed,
    SigaaError,
    SigaaParseError,
)
from ..models import InstitutionalEvaluation, InstitutionalQuestionnaire
from ..utils.jsf import (
    build_menu_action,
    build_postback,
    link_params,
    read_form,
    read_viewstate,
)
from ..utils.parsing import clean_text, lookup_key, parse_datetime
from .institutional_evaluation_answers import (
    build_evaluation_submit,
    normalize_answers,
    read_write_confirmation,
    reflects_answers,
)
from .institutional_questionnaire import parse_questionnaire, read_questionnaire_form
from .session import Session

_MENU_FORM_ID = "menu:form_menu_discente"
_LIST_FORM_ID = "form"
_OPEN_EVALUATION_FIELD = "form:responder"
_INTRO_TITLE = "Avaliação Institucional"
_INTRO_LINK_TEXT = "Preencher Avaliação"
_SAVE_COMMAND = "Salvar"
_FINALIZE_COMMAND = "Finalizar"
_MENU_ACTION = (
    "menu_form_menu_discente_discente_menu:A]"
    "#{ calendarioAvaliacaoInstitucionalBean.listar }"
)
_LIST_TITLE = "Lista de Avaliações Institucionais"
_LIST_COLUMNS = (
    "Ano-Período",
    "Formulário",
    "Perfil Entrevistado",
    "Ensino à Distância",
    "Período de Resposta",
)
_SEMESTER_RE = re.compile(r"\d{4}\.\d+")
_RESPONSE_PERIOD_RE = re.compile(r"(\d{2}/\d{2}/\d{4})\s+a\s+(\d{2}/\d{2}/\d{4})")


class InstitutionalEvaluations:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._lock = Lock()

    async def list_evaluations(self) -> list[InstitutionalEvaluation]:
        async with self._lock:
            try:
                page = await self._open_evaluations(allow_renewal=True)
            except SessionRenewed:
                page = await self._open_evaluations(allow_renewal=False)
        return [evaluation for evaluation, _ in _parse_evaluations(page)]

    async def get_questionnaire(self, sigaa_id: int) -> InstitutionalQuestionnaire:
        async with self._lock:
            evaluation, page = await self._read_questionnaire(sigaa_id)
        return parse_questionnaire(page, evaluation)

    async def save_draft(
        self, sigaa_id: int, answers: Mapping[str, str | None]
    ) -> InstitutionalQuestionnaire:
        async with self._lock:
            values, _ = await self._write_answers(sigaa_id, answers, _SAVE_COMMAND)
            try:
                evaluation, page = await self._read_questionnaire(sigaa_id)
                saved = parse_questionnaire(page, evaluation)
            except (SigaaError, httpx.HTTPError) as error:
                raise InstitutionalEvaluationWriteUnconfirmed(
                    "Não foi possível reabrir a avaliação para conferir o rascunho."
                ) from error
        if not reflects_answers(saved, values):
            raise InstitutionalEvaluationWriteUnconfirmed(
                "O rascunho reaberto não contém todas as alterações enviadas."
            )
        return saved

    async def submit_evaluation(
        self, sigaa_id: int, answers: Mapping[str, str | None] | None = None
    ) -> str:
        async with self._lock:
            _, confirmation = await self._write_answers(
                sigaa_id, answers or {}, _FINALIZE_COMMAND
            )
        if confirmation is None:
            raise InstitutionalEvaluationWriteUnconfirmed(
                "O SIGAA não devolveu confirmação de finalização da avaliação."
            )
        return confirmation

    async def _write_answers(
        self, sigaa_id: int, answers: Mapping[str, str | None], command: str
    ) -> tuple[dict[str, str], str | None]:
        evaluation, page = await self._read_questionnaire(sigaa_id)
        questionnaire = parse_questionnaire(page, evaluation)
        values = normalize_answers(questionnaire, answers)
        action, payload = build_evaluation_submit(
            read_questionnaire_form(page), command, values
        )
        try:
            response = await self._session.post(
                action, data=payload, allow_renewal=False
            )
        except (SessionExpired, httpx.HTTPError) as error:
            raise InstitutionalEvaluationWriteUnconfirmed(
                f"Não foi possível confirmar a ação `{command}` da avaliação no SIGAA."
            ) from error
        return values, read_write_confirmation(BeautifulSoup(response.text, "lxml"))

    async def _read_questionnaire(
        self, sigaa_id: int
    ) -> tuple[InstitutionalEvaluation, BeautifulSoup]:
        try:
            return await self._open_questionnaire(sigaa_id, allow_renewal=True)
        except SessionRenewed:
            return await self._open_questionnaire(sigaa_id, allow_renewal=False)

    async def _open_questionnaire(
        self, sigaa_id: int, *, allow_renewal: bool
    ) -> tuple[InstitutionalEvaluation, BeautifulSoup]:
        page = await self._open_evaluations(allow_renewal=allow_renewal)
        for evaluation, link in _parse_evaluations(page):
            if evaluation.sigaa_id == sigaa_id:
                break
        else:
            raise InstitutionalEvaluationNotFound(
                "Avaliação indisponível na lista do discente."
            )

        intro = await self._follow_link(
            read_form(page, _LIST_FORM_ID), link, allow_renewal=allow_renewal
        )
        heading = intro.select_one("#conteudo h2")
        link = next(
            (
                link
                for link in intro.select("#conteudo form a[onclick]")
                if clean_text(link) == _INTRO_LINK_TEXT
            ),
            None,
        )
        if heading is None or clean_text(heading) != _INTRO_TITLE or link is None:
            raise SigaaParseError("Tela inicial da avaliação institucional incompleta.")

        questionnaire = await self._follow_link(
            link.find_parent("form"), link, allow_renewal=allow_renewal
        )
        return evaluation, questionnaire

    async def _follow_link(
        self, form: Tag, link: Tag, *, allow_renewal: bool
    ) -> BeautifulSoup:
        params = link_params(link)
        if not params:
            raise SigaaParseError(
                "Ação JSF ausente no link da avaliação institucional."
            )
        action, payload = build_postback(form, params, read_viewstate(form))
        response = await self._session.post(
            action, data=payload, allow_renewal=allow_renewal
        )
        return BeautifulSoup(response.text, "lxml")

    async def _open_evaluations(self, *, allow_renewal: bool) -> BeautifulSoup:
        response = await self._session.get(DASHBOARD_PATH, allow_renewal=allow_renewal)
        form = read_form(BeautifulSoup(response.text, "lxml"), _MENU_FORM_ID)
        read_viewstate(form)
        action, payload = build_menu_action(form, _MENU_ACTION)
        response = await self._session.post(
            action, data=payload, allow_renewal=allow_renewal
        )
        return BeautifulSoup(response.text, "lxml")


def _parse_evaluations(
    page: BeautifulSoup,
) -> list[tuple[InstitutionalEvaluation, Tag]]:
    heading = page.select_one("#conteudo h2")
    if heading is None or not clean_text(heading).endswith(_LIST_TITLE):
        raise SigaaParseError(
            "Tela de lista de avaliações institucionais não encontrada."
        )

    caption = next(
        (
            caption
            for caption in page.select("#conteudo table.formulario > caption")
            if clean_text(caption) == _LIST_TITLE
        ),
        None,
    )
    if caption is None:
        raise SigaaParseError("Tabela de avaliações institucionais não encontrada.")
    rows = caption.parent.select("thead > tr, tbody > tr, :scope > tr")
    columns = _row_texts(rows[0])[: len(_LIST_COLUMNS)] if rows else ()
    if columns != _LIST_COLUMNS:
        raise SigaaParseError(
            "Colunas inesperadas na lista de avaliações institucionais."
        )
    return [_parse_evaluation(row) for row in rows[1:]]


def _row_texts(row: Tag) -> tuple[str, ...]:
    return tuple(
        clean_text(cell) for cell in row.find_all(["td", "th"], recursive=False)
    )


def _parse_evaluation(row: Tag) -> tuple[InstitutionalEvaluation, Tag]:
    cells = _row_texts(row)
    if len(cells) < len(_LIST_COLUMNS):
        raise SigaaParseError("Linha incompleta na lista de avaliações institucionais.")
    semester, title, profile, distance_learning, period = cells[: len(_LIST_COLUMNS)]
    distance_learning = lookup_key(distance_learning)
    dates = _RESPONSE_PERIOD_RE.fullmatch(period)
    link = row.find("a", id=_OPEN_EVALUATION_FIELD)
    sigaa_id = link_params(link).get("id", "") if link is not None else ""
    if link is None or not sigaa_id.isascii() or not sigaa_id.isdecimal():
        raise SigaaParseError("Link sem ID na lista de avaliações institucionais.")
    if (
        not _SEMESTER_RE.fullmatch(semester)
        or not title
        or not profile
        or distance_learning not in {"sim", "nao"}
        or dates is None
    ):
        raise SigaaParseError(
            "Campos inesperados na lista de avaliações institucionais."
        )

    evaluation = InstitutionalEvaluation(
        sigaa_id=int(sigaa_id),
        semester=semester,
        title=title,
        respondent_profile=profile,
        distance_learning=distance_learning == "sim",
        response_starts_on=parse_datetime(
            dates[1], "%d/%m/%Y", "do início da avaliação institucional"
        ).date(),
        response_ends_on=parse_datetime(
            dates[2], "%d/%m/%Y", "do fim da avaliação institucional"
        ).date(),
    )
    return evaluation, link
