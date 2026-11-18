from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from email.message import Message
from email.utils import collapse_rfc2231_value
from urllib.parse import urljoin, urlsplit

from bs4 import BeautifulSoup

from ..config import CLASSROOM_HOME_PATH, MATERIAL_DOWNLOAD_HOSTS, SIGAA_BASE_URL
from ..exceptions import MaterialNotFound, SigaaParseError
from ..models import MaterialFile
from ..utils.jsf import build_postback, read_form, read_viewstate
from ..utils.parsing import clean_text
from .posts import _material_id, _material_links, _topic_identity
from .session import Session

_MAX_REDIRECTS = 5
_CHUNK_SIZE = 64 * 1024


@asynccontextmanager
async def download_material(
    session: Session, page: str, material_id: str, allow_renewal: bool
) -> AsyncIterator[MaterialFile]:
    soup = BeautifulSoup(page, "lxml")
    form = read_form(soup, "formAva")
    links = []
    for topic in form.select(".topico-aula"):
        topic_id, *_ = _topic_identity(topic)
        for _, anchor, params, url in _material_links(topic):
            source_id = params.get("id")
            if (
                url is None
                and source_id
                and _material_id(topic_id, source_id) == material_id
            ):
                links.append((anchor, params))
    if not links:
        raise MaterialNotFound("Arquivo não encontrado nos tópicos da turma.")
    if len(links) != 1:
        raise SigaaParseError("Link do arquivo ausente ou ambíguo no tópico da turma.")
    anchor, params = links[0]
    action, payload = build_postback(form, params, read_viewstate(form))
    if action != urljoin(SIGAA_BASE_URL, CLASSROOM_HOME_PATH):
        raise SigaaParseError("Formulário de download fora da Principal da turma.")

    method, target, data = "POST", action, payload
    for _ in range(_MAX_REDIRECTS + 1):
        async with session.stream(
            method, target, data=data, allow_renewal=allow_renewal
        ) as response:
            if response.is_redirect:
                if response.status_code not in (301, 302, 303) and not (
                    response.status_code in (307, 308) and method == "GET"
                ):
                    raise SigaaParseError(
                        "Redirecionamento de download incompatível com o método."
                    )
                location = response.headers.get("location")
                if not location:
                    raise SigaaParseError("Redirecionamento de download sem destino.")
                target = urljoin(str(response.url), location)
                _validate_destination(target)
                method, data = "GET", None
                continue

            filename = _filename(
                response.headers.get("content-disposition", ""), clean_text(anchor)
            )
            if response.status_code != 200 or not filename:
                raise SigaaParseError("SIGAA não devolveu um anexo para o tópico.")
            chunks = response.aiter_bytes(chunk_size=_CHUNK_SIZE)
            first = await anext(chunks, b"")
            if not first:
                raise SigaaParseError("Arquivo do tópico recebido vazio.")
            yield MaterialFile(
                content=_with_first_chunk(first, chunks),
                filename=filename,
                content_type=response.headers.get(
                    "content-type", "application/octet-stream"
                ),
            )
            return

    raise SigaaParseError("Download do material excedeu o limite de redirecionamentos.")


async def _with_first_chunk(
    first: bytes, chunks: AsyncIterator[bytes]
) -> AsyncIterator[bytes]:
    yield first
    async for chunk in chunks:
        yield chunk


def _filename(disposition: str, title: str) -> str:
    headers = Message()
    headers["content-disposition"] = disposition
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
        or (title if headers.get_content_disposition() == "attachment" else "")
    )
    filename = filename.replace("\\", "/").rsplit("/", 1)[-1]
    return "".join(char for char in filename if ord(char) >= 32 and ord(char) != 127)


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
