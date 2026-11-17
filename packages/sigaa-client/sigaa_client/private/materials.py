from email.message import Message
from email.utils import collapse_rfc2231_value
from urllib.parse import urljoin, urlsplit

from bs4 import BeautifulSoup

from ..config import CLASSROOM_HOME_PATH, MATERIAL_DOWNLOAD_HOSTS, SIGAA_BASE_URL
from ..exceptions import MaterialNotFound, SigaaParseError
from ..models import MaterialFile
from ..utils.jsf import build_postback, link_params, read_form, read_viewstate
from ..utils.parsing import clean_text
from .posts import _material_id, _material_links, _topic_identity
from .session import Session

_MAX_REDIRECTS = 5


async def download_material(
    session: Session, page: str, material_id: str, allow_renewal: bool
) -> MaterialFile:
    soup = BeautifulSoup(page, "lxml")
    form = read_form(soup, "formAva")
    links = []
    for topic in form.select(".topico-aula"):
        topic_id, *_ = _topic_identity(topic)
        for _, anchor in _material_links(topic):
            if str(anchor.get("href") or "").strip() not in ("", "#"):
                continue
            source_id = link_params(anchor).get("id")
            if source_id and _material_id(topic_id, source_id) == material_id:
                links.append(anchor)
    if not links:
        raise MaterialNotFound("Arquivo não encontrado nos tópicos da turma.")
    if len(links) != 1:
        raise SigaaParseError("Link do arquivo ausente ou ambíguo no tópico da turma.")
    action, payload = build_postback(form, link_params(links[0]), read_viewstate(form))
    if action != urljoin(SIGAA_BASE_URL, CLASSROOM_HOME_PATH):
        raise SigaaParseError("Formulário de download fora da Principal da turma.")

    response = await session.post(
        action,
        data=payload,
        follow_redirects=False,
        allow_redirect_response=True,
        allow_renewal=allow_renewal,
    )
    for _ in range(_MAX_REDIRECTS):
        if not response.is_redirect:
            break
        if response.status_code not in (301, 302, 303) and not (
            response.status_code in (307, 308) and response.request.method == "GET"
        ):
            raise SigaaParseError(
                "Redirecionamento de download incompatível com o método."
            )
        target = urljoin(str(response.url), response.headers.get("location", ""))
        _validate_destination(target)
        response = await session.get(
            target,
            follow_redirects=False,
            allow_redirect_response=True,
            retry_on_renewal=False,
            allow_renewal=allow_renewal,
        )
    if response.is_redirect:
        raise SigaaParseError(
            "Download do material excedeu o limite de redirecionamentos."
        )
    headers = Message()
    headers["content-disposition"] = response.headers.get("content-disposition", "")
    filename = (
        next(
            (
                collapse_rfc2231_value(value)
                for key, value in headers.get_params(
                    header="content-disposition", unquote=True
                )
                or []
                if key == "filename" and isinstance(value, tuple)
            ),
            None,
        )
        or headers.get_filename()
        or clean_text(links[0])
    )
    filename = filename.replace("\\", "/").rsplit("/", 1)[-1]
    filename = "".join(
        char for char in filename if ord(char) >= 32 and ord(char) != 127
    )
    content_type = response.headers.get("content-type", "application/octet-stream")
    prefix = response.content[:512].lstrip().lower()
    html = (
        "text/html" in content_type.lower()
        or "application/xhtml" in content_type.lower()
    )
    html = html or prefix.startswith((b"<!doctype html", b"<html", b"<form"))
    if html:
        document = BeautifulSoup(response.content, "lxml")
        error = document.select_one('input[type="password"], ul.erros, #errors')
        if error is not None or headers.get_content_disposition() != "attachment":
            raise SigaaParseError(
                "SIGAA devolveu uma página em vez do arquivo do tópico."
            )
    if response.status_code != 200 or not response.content or not filename:
        raise SigaaParseError("Arquivo do tópico não recebido do SIGAA.")
    return MaterialFile(
        content=response.content, filename=filename, content_type=content_type
    )


def _validate_destination(target: str) -> None:
    url = urlsplit(target)
    if (
        url.scheme != "https"
        or url.hostname not in MATERIAL_DOWNLOAD_HOSTS
        or url.netloc != url.hostname
        or url.username is not None
    ):
        raise SigaaParseError(
            "Destino de download fora dos servidores de arquivos da UnB."
        )
