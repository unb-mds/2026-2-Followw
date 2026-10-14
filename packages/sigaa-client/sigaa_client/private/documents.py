from urllib.parse import urljoin, urlsplit

import httpx
from bs4 import BeautifulSoup, Tag
from playwright.async_api import Error as PlaywrightError
from playwright.async_api import Route, async_playwright

from ..config import DASHBOARD_PATH, PRINT_RESOURCE_PATHS, SIGAA_BASE_URL
from ..exceptions import SessionRenewed, SigaaError, SigaaParseError
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
_PRINT_RESOURCE_TYPES = {"stylesheet", "image", "font", "script"}


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

    async def get_enrollment_certificate_pdf(self) -> bytes:
        """Atestado de matrícula do SIGAA convertido de HTML para PDF."""
        content = await self._request_document(_ENROLLMENT_CERTIFICATE_MENU_ACTION)
        if content.startswith(b"%PDF-"):
            return content
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
        base = soup.new_tag("base", href=urljoin(SIGAA_BASE_URL, DASHBOARD_PATH))
        head.insert(0, base)
        return await self._print_pdf(str(soup))

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

    async def _print_pdf(self, html: str) -> bytes:
        errors: list[Exception] = []

        async def resource(route: Route) -> None:
            request = route.request
            url = urlsplit(request.url)
            if (
                url.netloc != urlsplit(SIGAA_BASE_URL).netloc
                or url.scheme != "https"
                or request.method != "GET"
                or request.resource_type not in _PRINT_RESOURCE_TYPES
                or not url.path.startswith(PRINT_RESOURCE_PATHS)
            ):
                await route.abort()
                return
            try:
                response = await self._session.get(request.url)
                await route.fulfill(
                    body=response.content,
                    content_type=response.headers.get(
                        "content-type", "application/octet-stream"
                    ),
                )
            except (SigaaError, httpx.HTTPError, PlaywrightError) as error:
                errors.append(error)
                await route.abort()

        try:
            async with async_playwright() as playwright:
                browser = await playwright.chromium.launch()
                try:
                    page = await browser.new_page(service_workers="block")
                    await page.route("**/*", resource)
                    await page.set_content(html, wait_until="networkidle")
                    if errors:
                        raise errors[0]
                    await page.emulate_media(media="print")
                    return await page.pdf(format="A4", print_background=True)
                finally:
                    await browser.close()
        except PlaywrightError as error:
            raise SigaaParseError(
                "Não foi possível gerar o PDF do atestado de matrícula; "
                "verifique a instalação do Chromium do Playwright."
            ) from error


def _pdf(content: bytes, document: str) -> bytes:
    if not content.startswith(b"%PDF-"):
        raise SigaaParseError(f"PDF {document} não recebido do SIGAA.")
    return content
