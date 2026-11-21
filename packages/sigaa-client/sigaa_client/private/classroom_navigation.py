from bs4 import BeautifulSoup, Tag

from ..config import CLASSROOM_HOME_PATH
from ..exceptions import SigaaParseError
from ..utils.jsf import build_postback, link_params, read_form, read_viewstate
from ..utils.parsing import clean_text
from .session import Session

MENU_FORM_ID = "formMenu"
CLASSROOM_MAIN_MENU_LABEL = "Principal"
TOPICS_LIST_BUTTON = "formAcoesTurma:visualizarAulasEmLista"
TOPICS_LIST_LINK = "formAcoesTurma:linkExibirEmLista"


async def open_menu(session: Session, label: str, allow_renewal: bool) -> str:
    """Essas telas só abrem pelo item do menu da turma — GET direto dá erro."""
    response = await session.get(
        CLASSROOM_HOME_PATH, retry_on_renewal=False, allow_renewal=allow_renewal
    )
    soup = BeautifulSoup(response.text, "lxml")
    anchor = next(
        (link for link in soup.find_all("a") if clean_text(link) == label), None
    )
    if not isinstance(anchor, Tag):
        raise SigaaParseError(f"Item `{label}` não encontrado no menu da turma.")

    action, payload = build_postback(
        read_form(soup, MENU_FORM_ID), link_params(anchor), read_viewstate(soup)
    )
    response = await session.post(action, data=payload, allow_renewal=allow_renewal)
    return response.text


async def open_topics(session: Session, allow_renewal: bool) -> str:
    page = await open_menu(session, CLASSROOM_MAIN_MENU_LABEL, allow_renewal)
    soup = BeautifulSoup(page, "lxml")
    button = soup.find(id=TOPICS_LIST_BUTTON)
    if button is None:
        return page
    anchor = soup.find(id=TOPICS_LIST_LINK)
    if not isinstance(anchor, Tag):
        raise SigaaParseError("Link para exibir os tópicos em lista não encontrado.")
    form = button.find_parent("form")
    if not isinstance(form, Tag):
        raise SigaaParseError("Botão de tópicos em lista sem form.")
    action, payload = build_postback(form, link_params(anchor), read_viewstate(soup))
    response = await session.post(action, data=payload, allow_renewal=allow_renewal)
    return response.text
