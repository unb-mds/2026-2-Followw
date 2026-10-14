from bs4 import BeautifulSoup, Tag

from ..config import DASHBOARD_PATH
from ..exceptions import SessionRenewed, SigaaParseError
from ..utils.jsf import build_menu_action, read_viewstate
from .session import Session

_STUDENT_CARD_MENU_FORM_ID = "menu:form_menu_discente"
_STUDENT_CARD_MENU_ACTION = (
    "menu_form_menu_discente_discente_menu:A]"
    "#{ portalDiscente.emitiCarteiraEstudantilUnb }"
)
_TRANSCRIPT_MENU_ACTION = (
    "menu_form_menu_discente_discente_menu:A]#{ portalDiscente.historico }"
)


class Documents:
    def __init__(self, session: Session) -> None:
        self._session = session

    async def get_student_card_pdf(self) -> bytes:
        """PDF original da carteirinha estudantil do usuário autenticado."""
        return _pdf(
            await self._request_document(_STUDENT_CARD_MENU_ACTION),
            "da carteirinha estudantil",
        )

    async def get_transcript_pdf(self) -> bytes:
        """PDF original do histórico acadêmico do usuário autenticado."""
        return _pdf(
            await self._request_document(_TRANSCRIPT_MENU_ACTION),
            "do histórico acadêmico",
        )

    async def _request_document(self, menu_action: str) -> bytes:
        try:
            return await self._post_document(menu_action)
        except SessionRenewed:
            return await self._post_document(menu_action)

    async def _post_document(self, menu_action: str) -> bytes:
        page = await self._session.get(DASHBOARD_PATH)
        soup = BeautifulSoup(page.text, "lxml")

        form = soup.find("form", id=_STUDENT_CARD_MENU_FORM_ID)
        if not isinstance(form, Tag):
            raise SigaaParseError("Menu do discente não encontrado no portal.")

        read_viewstate(form)
        action, payload = build_menu_action(form, menu_action)
        response = await self._session.post(action, data=payload)

        return response.content


def _pdf(content: bytes, document: str) -> bytes:
    if not content.startswith(b"%PDF-"):
        raise SigaaParseError(f"PDF {document} não recebido do SIGAA.")
    return content
