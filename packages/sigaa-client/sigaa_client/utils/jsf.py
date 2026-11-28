"""Mecânica de postback do JSF — o `ViewState` e o payload de um `jsfcljs`."""

import re
from urllib.parse import urljoin

from bs4 import BeautifulSoup, Tag

from ..config import SIGAA_BASE_URL
from ..exceptions import SigaaParseError

VIEWSTATE_FIELD = "javax.faces.ViewState"

_PARAMS_RE = re.compile(r"'([^']+)'\s*:\s*'([^']*)'")


def read_form(soup: BeautifulSoup, form_id: str) -> Tag:
    form = soup.find("form", id=form_id)
    if not isinstance(form, Tag):
        raise SigaaParseError(f"Form `{form_id}` não encontrado na página.")
    return form


def read_viewstate(soup: BeautifulSoup | Tag) -> str:
    """O `ViewState` muda a cada postback: sempre ler o da resposta mais recente."""
    field = soup.find("input", attrs={"name": VIEWSTATE_FIELD})
    if not isinstance(field, Tag) or not field.get("value"):
        raise SigaaParseError(
            f"`{VIEWSTATE_FIELD}` ausente — sessão expirada ou layout mudou."
        )
    return str(field["value"])


def link_params(anchor: Tag) -> dict[str, str]:
    """Os pares que o `onclick` do link passa para `jsfcljs`."""
    return dict(_PARAMS_RE.findall(anchor.get("onclick") or ""))


def build_postback(
    form: Tag, params: dict[str, str], viewstate: str
) -> tuple[str, dict[str, str]]:
    """A URL e o corpo do POST que reproduzem o clique no link."""
    name = form.get("name") or form.get("id")
    if not name:
        raise SigaaParseError("Form do postback não tem `name` nem `id`.")

    action = urljoin(SIGAA_BASE_URL, str(form.get("action") or ""))
    payload = {str(name): str(name), **params, VIEWSTATE_FIELD: viewstate}
    return action, payload


def build_submit(
    form: Tag, values: dict[str, str], button: str
) -> tuple[str, dict[str, str]]:
    """A URL e o corpo de um submit de verdade, partindo do estado atual do form.

    Diferente de `build_postback`, aqui o form é enviado inteiro: os campos que
    não forem sobrescritos por `values` vão com o valor que a página trouxe —
    inclusive o `ViewState`.
    """
    payload = _form_defaults(form)
    payload.update(values)
    payload[_submit_field(form, button)] = button
    return urljoin(SIGAA_BASE_URL, str(form.get("action") or "")), payload


def build_menu_action(form: Tag, action: str) -> tuple[str, dict[str, str]]:
    """A URL e o corpo do postback de um item do menu lateral (`jscookMenu`).

    Diferente do link `jsfcljs`, o clique aqui só troca o hidden `jscook_action`
    do form e submete o resto do estado como veio — sem botão nem parâmetros
    extras.
    """
    payload = _form_defaults(form)
    payload["jscook_action"] = action
    return urljoin(SIGAA_BASE_URL, str(form.get("action") or "")), payload


def build_link_submit(
    form: Tag, link: Tag, values: dict[str, str]
) -> tuple[str, dict[str, str]]:
    """Reproduz o envio de um formulário preenchido por um link JSF."""
    params = link_params(link)
    if not params:
        raise SigaaParseError("Link de envio sem ação JSF.")
    action, postback = build_postback(form, params, read_viewstate(form))
    return action, {**_form_defaults(form), **values, **postback}


def option_value(option: Tag) -> str:
    return str(option.get("value", option.get_text()))


def selected_value(select: Tag) -> str:
    chosen = select.find("option", selected=True) or select.find("option")
    return option_value(chosen) if isinstance(chosen, Tag) else ""


def _form_defaults(form: Tag) -> dict[str, str]:
    payload: dict[str, str] = {}

    for field in form.find_all("input"):
        name = field.get("name")
        kind = str(field.get("type") or "text").lower()
        if (
            not name
            or field.has_attr("disabled")
            or kind in {"submit", "image", "button", "reset", "file"}
        ):
            continue
        if kind in ("checkbox", "radio") and field.get("checked") is None:
            continue
        payload[str(name)] = str(field.get("value") or "")

    for field in form.select(
        "select[name]:not([disabled]), textarea[name]:not([disabled])"
    ):
        payload[str(field["name"])] = (
            selected_value(field) if field.name == "select" else field.get_text()
        )

    return payload


def _submit_field(form: Tag, button: str) -> str:
    """O `name` do botão é gerado pelo JSF (`j_id_jsp_...`): achar pelo rótulo."""
    field = form.find("input", attrs={"type": "submit", "value": button})
    if not isinstance(field, Tag) or not field.get("name"):
        raise SigaaParseError(f"Botão `{button}` não encontrado no form.")
    return str(field["name"])
