from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from email.message import Message
from email.utils import collapse_rfc2231_value
from urllib.parse import urljoin

from bs4 import BeautifulSoup, Tag

from ..config import CLASSROOM_HOME_PATH, MATERIAL_DOWNLOAD_HOSTS, SIGAA_BASE_URL
from ..exceptions import MaterialNotFound, SigaaParseError
from ..models import MaterialFile, MaterialKind
from ..utils.jsf import build_postback, read_form, read_viewstate
from ..utils.parsing import clean_text
from .session import Session
from .topics import TOPICS_FORM_ID, TopicMaterial, read_topics

_CHUNK_SIZE = 64 * 1024


@asynccontextmanager
async def download_material(
    session: Session, page: str, material_id: str, allow_renewal: bool
) -> AsyncIterator[MaterialFile]:
    form = read_form(BeautifulSoup(page, "lxml"), TOPICS_FORM_ID)
    material = _find_file(form, material_id)
    action, payload = build_postback(form, material.params, read_viewstate(form))
    if action != urljoin(SIGAA_BASE_URL, CLASSROOM_HOME_PATH):
        raise SigaaParseError("Formulário de download fora da Principal da turma.")

    async with session.stream(
        "POST",
        action,
        data=payload,
        allowed_hosts=MATERIAL_DOWNLOAD_HOSTS,
        allow_renewal=allow_renewal,
    ) as response:
        filename = _filename(
            response.headers.get("content-disposition", ""),
            clean_text(material.anchor),
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


def _find_file(form: Tag, material_id: str) -> TopicMaterial:
    matches = [
        material
        for topic in read_topics(form)
        for material in topic.materials
        if material.id == material_id and material.kind is MaterialKind.FILE
    ]
    if not matches:
        raise MaterialNotFound("Arquivo não encontrado nos tópicos da turma.")
    if len(matches) != 1:
        raise SigaaParseError("Link do arquivo ambíguo no tópico da turma.")
    return matches[0]


async def _with_first_chunk(
    first: bytes, chunks: AsyncIterator[bytes]
) -> AsyncIterator[bytes]:
    yield first
    async for chunk in chunks:
        yield chunk


def _filename(disposition: str, title: str) -> str:
    headers = Message()
    headers["content-disposition"] = disposition
    params = headers.get_params(header="content-disposition", unquote=True) or []
    # `get_filename` prefere `filename` a `filename*`; a RFC 6266 pede o contrário.
    extended = next(
        (
            collapse_rfc2231_value(value)
            for key, value in params
            if key == "filename" and isinstance(value, tuple)
        ),
        None,
    )
    fallback = title if headers.get_content_disposition() == "attachment" else ""
    filename = extended or headers.get_filename() or fallback
    filename = filename.replace("\\", "/").rsplit("/", 1)[-1]
    return "".join(char for char in filename if ord(char) >= 32 and ord(char) != 127)
