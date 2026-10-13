import re
from typing import get_args

from bs4 import BeautifulSoup, Tag

from ..config import PUBLIC_SUBJECTS_PATH
from ..exceptions import SessionExpired, SigaaParseError, SigaaSearchError
from ..models import (
    PublicSubject,
    SubjectLevel,
    SubjectSearchMessage,
    SubjectSearchResult,
    SubjectType,
    TeachingLevel,
    Unit,
)
from ..utils.jsf import build_submit, link_params, read_form, read_viewstate
from ..utils.parsing import clean_text, lookup_key
from .session import PublicSession
from .units import parse_units, resolve_unit

FORM_ID = "form"
RESULTS_FORM_ID = "formListagemComponentes"
SEARCH_BUTTON = "Buscar Componentes"
LEVEL_FIELD = "form:nivel"
TYPE_FIELD = "form:tipo"
UNIT_FIELD = "form:unidades"
TYPE_CHECK = "form:checkTipo"
CODE_CHECK = "form:checkCodigo"
NAME_CHECK = "form:checkNome"
UNIT_CHECK = "form:checkUnidade"

_TYPE_VALUES = {
    SubjectType.DISCIPLINA: "2",
    SubjectType.ATIVIDADE: "1",
    SubjectType.BLOCO: "4",
    SubjectType.MODULO: "3",
}
_HOURS_RE = re.compile(r"^(\d+)\s*h$", re.IGNORECASE)
_NO_RESULTS = "nao foram encontrados resultados"
_LIMIT_EXCEEDED = "a busca excedeu o numero maximo de"


class PublicSubjects:
    """Busca no catálogo público de componentes curriculares, sem login."""

    def __init__(self, session: PublicSession) -> None:
        self._session = session

    async def search(
        self,
        unit: Unit | int | str | None = None,
        *,
        level: SubjectLevel = TeachingLevel.GRADUACAO,
        type: SubjectType | None = None,
        code: str | None = None,
        name: str | None = None,
    ) -> SubjectSearchResult:
        if level not in get_args(SubjectLevel):
            raise SigaaSearchError(
                "Nível inválido para componentes; use F, G, L, R ou S."
            )
        if type is not None and type not in _TYPE_VALUES:
            raise SigaaSearchError("Tipo de componente inválido.")
        for label, value in (("Código", code), ("Nome", name), ("Unidade", unit)):
            if isinstance(value, str) and not value.strip():
                raise SigaaSearchError(f"{label}: filtro não pode ser vazio.")
        try:
            soup = await self._submit(unit, level, type, code, name)
        except SessionExpired:
            await self._session.restart()
            soup = await self._submit(unit, level, type, code, name)
        return _parse_results(soup, level)

    async def _submit(
        self,
        unit: Unit | int | str | None,
        level: SubjectLevel,
        type: SubjectType | None,
        code: str | None,
        name: str | None,
    ) -> BeautifulSoup:
        form = read_form(await self._session.open(PUBLIC_SUBJECTS_PATH), FORM_ID)
        read_viewstate(form)
        for field in (LEVEL_FIELD, TYPE_FIELD, UNIT_FIELD):
            if form.find("select", attrs={"name": field}) is None:
                raise SigaaParseError(
                    f"Select `{field}` ausente na busca de componentes."
                )
        values = {
            LEVEL_FIELD: TeachingLevel(level).value,
            TYPE_FIELD: _TYPE_VALUES[type] if type is not None else "0",
            UNIT_FIELD: "0",
            _text_field(form, CODE_CHECK): code.strip() if code is not None else "",
            _text_field(form, NAME_CHECK): name.strip() if name is not None else "",
        }
        if unit is not None:
            wanted = unit.strip() if isinstance(unit, str) else unit
            units = parse_units(form, UNIT_FIELD)
            selected = resolve_unit(units, wanted)
            if selected not in {item.id for item in units}:
                raise SigaaSearchError(f"Unidade `{selected}` não disponível na busca.")
            values[UNIT_FIELD] = str(selected)
        action, payload = build_submit(form, values, SEARCH_BUTTON)
        for check, enabled in (
            (TYPE_CHECK, type is not None),
            (CODE_CHECK, code is not None),
            (NAME_CHECK, name is not None),
            (UNIT_CHECK, unit is not None),
        ):
            checkbox = form.find("input", attrs={"name": check, "type": "checkbox"})
            if not isinstance(checkbox, Tag):
                raise SigaaParseError(
                    f"Checkbox `{check}` ausente na busca de componentes."
                )
            payload.pop(check, None)
            if enabled:
                payload[check] = str(checkbox.get("value") or "on")
        return await self._session.submit(action, payload)


def _text_field(form: Tag, check: str) -> str:
    checkbox = form.find("input", attrs={"name": check})
    row = checkbox.find_parent("tr") if isinstance(checkbox, Tag) else None
    field = row.find("input", attrs={"type": "text"}) if isinstance(row, Tag) else None
    if not isinstance(field, Tag) or not field.get("name"):
        raise SigaaParseError(
            f"Campo de texto de `{check}` ausente na busca de componentes."
        )
    return str(field["name"])


def _parse_results(soup: BeautifulSoup, level: SubjectLevel) -> SubjectSearchResult:
    messages = []
    errors = []
    for item in soup.select("ul.erros li"):
        text = clean_text(item)
        normalized = lookup_key(text)
        if _LIMIT_EXCEEDED in normalized:
            messages.append(
                SubjectSearchMessage(
                    code="result_limit_exceeded", severity="warning", text=text
                )
            )
        elif _NO_RESULTS in normalized:
            messages.append(
                SubjectSearchMessage(code="no_results", severity="info", text=text)
            )
        else:
            errors.append(text)
    if errors:
        raise SigaaSearchError(" ".join(errors))
    truncated = any(message.code == "result_limit_exceeded" for message in messages)
    if any(message.code == "no_results" for message in messages) and not truncated:
        return SubjectSearchResult(messages=tuple(messages))

    form = read_form(soup, RESULTS_FORM_ID)
    table = form.find("table")
    if not isinstance(table, Tag):
        raise SigaaParseError("Tabela de componentes ausente no resultado da busca.")
    subjects = []
    for row in table.find_all("tr"):
        cells = row.find_all("td", recursive=False)
        if not cells:
            continue
        if len(cells) != 5:
            raise SigaaParseError(
                "Linha da busca de componentes deve ter cinco colunas."
            )
        subjects.append(_parse_subject(cells, level))
    if not subjects:
        raise SigaaParseError(
            "Tabela de componentes vazia sem mensagem de busca vazia."
        )
    return SubjectSearchResult(
        items=tuple(subjects), messages=tuple(messages), truncated=truncated
    )


def _parse_subject(cells: list[Tag], level: SubjectLevel) -> PublicSubject:
    code, name, kind, workload = (clean_text(cell) for cell in cells[:4])
    anchor = cells[4].find("a", title="Detalhes do Componente Curricular")
    sigaa_id = link_params(anchor).get("id", "") if isinstance(anchor, Tag) else ""
    if not sigaa_id.isdigit() or int(sigaa_id) <= 0 or not code or not name:
        raise SigaaParseError(
            "Componente sem ID, código ou nome no resultado da busca."
        )
    try:
        type = SubjectType(kind)
    except ValueError as error:
        raise SigaaParseError(
            f"Tipo `{kind}` desconhecido no componente `{code}`."
        ) from error
    hours = _HOURS_RE.fullmatch(workload)
    if workload not in ("", "-") and hours is None:
        raise SigaaParseError(
            f"Carga horária `{workload}` inválida no componente `{code}`."
        )
    return PublicSubject(
        sigaa_id=int(sigaa_id),
        code=code,
        name=name,
        type=type,
        hours=int(hours[1]) if hours else None,
        level=level,
    )
