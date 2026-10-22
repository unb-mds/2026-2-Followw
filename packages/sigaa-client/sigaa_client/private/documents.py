from bs4 import BeautifulSoup, Tag

from ..config import DASHBOARD_PATH
from ..exceptions import (
    DocumentUnavailable,
    MissingProfilePhoto,
    SessionRenewed,
    SigaaParseError,
)
from ..utils.jsf import build_menu_action, read_viewstate
from ..utils.parsing import clean_text, lookup_key
from .session import Session

_MENU_FORM_ID = "menu:form_menu_discente"
_STUDENT_CARD_MENU_ACTION = (
    "menu_form_menu_discente_discente_menu:A]"
    "#{ portalDiscente.emitiCarteiraEstudantilUnb }"
)
_TRANSCRIPT_MENU_ACTION = (
    "menu_form_menu_discente_discente_menu:A]#{ portalDiscente.historico }"
)
_PDF_HEADER = b"%PDF-"
_MISSING_PHOTO = "nao possui foto"


class Documents:
    def __init__(self, session: Session) -> None:
        self._session = session

    async def get_student_card_pdf(self) -> bytes:
        """PDF original da carteirinha estudantil do usuário autenticado."""
        return await download_student_card_pdf(self._session)

    async def get_transcript_pdf(self) -> bytes:
        """PDF original do histórico acadêmico do usuário autenticado."""
        return await _download_pdf(
            self._session, _TRANSCRIPT_MENU_ACTION, "do histórico acadêmico"
        )


async def download_student_card_pdf(session: Session) -> bytes:
    """Compartilhado com o RU, que lê o QR code da carteirinha."""
    return await _download_pdf(
        session, _STUDENT_CARD_MENU_ACTION, "da carteirinha estudantil"
    )


async def _download_pdf(session: Session, menu_action: str, document: str) -> bytes:
    """Baixa o PDF de um item do menu do discente, com uma retentativa pós-relogin."""
    try:
        content = await _post_menu(session, menu_action, allow_renewal=True)
    except SessionRenewed:
        content = await _post_menu(session, menu_action, allow_renewal=False)

    # O PDF pode vir com bytes antes do cabeçalho, o que a especificação tolera.
    if _PDF_HEADER not in content[:1024]:
        # Ex.: carteirinha sem foto no perfil volta ao portal com o motivo.
        soup = BeautifulSoup(content, "lxml")
        if messages := [clean_text(item) for item in soup.select("ul.erros li")]:
            message = " ".join(messages)
            if _MISSING_PHOTO in lookup_key(message):
                raise MissingProfilePhoto(message)
            raise DocumentUnavailable(message)
        raise SigaaParseError(f"PDF {document} não recebido do SIGAA.")
    return content


async def _post_menu(
    session: Session, menu_action: str, *, allow_renewal: bool
) -> bytes:
    page = await session.get(DASHBOARD_PATH, allow_renewal=allow_renewal)
    soup = BeautifulSoup(page.text, "lxml")

    form = soup.find("form", id=_MENU_FORM_ID)
    if not isinstance(form, Tag):
        raise SigaaParseError("Menu do discente não encontrado no portal.")

    read_viewstate(form)
    action, payload = build_menu_action(form, menu_action)
    response = await session.post(action, data=payload, allow_renewal=allow_renewal)
    return response.content
