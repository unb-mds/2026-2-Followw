from urllib.parse import urljoin

from bs4 import BeautifulSoup, Tag

from ..config import DASHBOARD_PATH, SIGAA_BASE_URL
from ..exceptions import SessionRenewed, SigaaParseError
from ..utils.jsf import build_menu_action, read_viewstate
from ..utils.parsing import clean_text
from .session import Session

_STUDENT_CARD_MENU_FORM_ID = "menu:form_menu_discente"
_STUDENT_CARD_MENU_ACTION = (
    "menu_form_menu_discente_discente_menu:A]"
    "#{ portalDiscente.emitiCarteiraEstudantilUnb }"
)
_ENROLLMENT_CERTIFICATE_MENU_ACTION = (
    "menu_form_menu_discente_discente_menu:A]#{ portalDiscente.atestadoMatriculaUnb }"
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

    async def get_enrollment_certificate_html(self) -> str:
        """HTML de impressão do atestado de matrícula emitido pelo SIGAA."""
        content = await self._request_document(_ENROLLMENT_CERTIFICATE_MENU_ACTION)
        soup = BeautifulSoup(content, "lxml")
        heading = soup.select_one("#relatorio-container #relatorio h3")
        if heading is None or clean_text(heading) != "Atestado de Matrícula":
            raise SigaaParseError(
                "Atestado de matrícula não encontrado na resposta do SIGAA."
            )
        head = soup.head
        if head is None:
            raise SigaaParseError("Cabeçalho do atestado de matrícula não encontrado.")
        for base in soup.find_all("base"):
            base.decompose()
        for meta in head.find_all("meta"):
            if (
                meta.has_attr("charset")
                or str(meta.get("http-equiv", "")).lower() == "content-type"
            ):
                meta.decompose()
        base = soup.new_tag("base", href=urljoin(SIGAA_BASE_URL, DASHBOARD_PATH))
        head.insert(0, base)
        head.insert(0, soup.new_tag("meta", charset="utf-8"))
        return str(soup)

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
