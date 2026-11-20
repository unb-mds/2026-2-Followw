import re
from collections import Counter
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import date
from hashlib import sha256
from urllib.parse import urljoin, urlsplit

from bs4 import Tag

from ..config import SIGAA_BASE_URL
from ..exceptions import SigaaParseError
from ..models import MaterialKind
from ..utils.jsf import link_params
from ..utils.parsing import clean_text, parse_datetime

TOPICS_FORM_ID = "formAva"

_TOPIC_DATES_RE = re.compile(
    r"^(.*?)\s*\((\d{2}/\d{2}/\d{4})\s*-\s*(\d{2}/\d{2}/\d{4})\)"
)


@dataclass(frozen=True, slots=True)
class TopicMaterial:
    id: str | None  # None quando o item não traz `id` nem link
    item: Tag
    anchor: Tag
    params: dict[str, str]
    url: str | None
    kind: MaterialKind


@dataclass(frozen=True, slots=True)
class Topic:
    id: str
    title: str
    starts_on: date
    ends_on: date
    tag: Tag
    materials: tuple[TopicMaterial, ...]


def read_topics(form: Tag) -> Iterator[Topic]:
    """Tópicos do `formAva` com seus itens, na ordem da página."""
    for tag in form.select(".topico-aula"):
        heading = tag.select_one(".titulo")
        match = _TOPIC_DATES_RE.match(clean_text(heading)) if heading else None
        if match is None or not match.group(1).strip():
            raise SigaaParseError("Tópico de aula sem título ou período reconhecível.")
        title, start, end = match.groups()
        # A lista não expõe o ID do tópico; nunca use o índice instável do JSF.
        topic_id = f"topic:{_fingerprint(match.group(0))}"
        yield Topic(
            id=topic_id,
            title=title.strip(),
            starts_on=parse_datetime(start, "%d/%m/%Y", "do tópico").date(),
            ends_on=parse_datetime(end, "%d/%m/%Y", "do tópico").date(),
            tag=tag,
            materials=tuple(_read_materials(topic_id, tag)),
        )


def _read_materials(topic_id: str, topic: Tag) -> Iterator[TopicMaterial]:
    """Repetições do mesmo item no tópico ganham `#n` no ID."""
    seen: Counter[str] = Counter()
    for item in topic.select(".item"):
        anchor = item.find("a")
        if not isinstance(anchor, Tag):
            continue
        params = link_params(anchor)
        url = _external_url(anchor)
        source_id = params.get("id") or url
        material_id = None
        if source_id is not None:
            occurrence = seen[source_id]
            seen[source_id] += 1
            suffix = f"#{occurrence}" if occurrence else ""
            material_id = f"material:{_fingerprint(f'{topic_id}:{source_id}{suffix}')}"
        yield TopicMaterial(
            id=material_id,
            item=item,
            anchor=anchor,
            params=params,
            url=url,
            kind=_kind(anchor, url),
        )


def _external_url(anchor: Tag) -> str | None:
    href = str(anchor.get("href") or "").strip()
    if not href or href == "#":
        return None
    try:
        url = urljoin(SIGAA_BASE_URL, href)
        return url if urlsplit(url).scheme in ("http", "https") else None
    except ValueError:
        return None


def _kind(anchor: Tag, url: str | None) -> MaterialKind:
    if url is not None:
        return MaterialKind.LINK
    # O link do arquivo é anônimo no JSF; ações como enviar tarefa trazem `id` próprio.
    return MaterialKind.ACTION if anchor.get("id") else MaterialKind.FILE


def _fingerprint(value: str) -> str:
    return sha256(value.encode()).hexdigest()
