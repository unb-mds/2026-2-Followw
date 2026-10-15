import re
from hashlib import sha256
from urllib.parse import urljoin, urlsplit

from bs4 import BeautifulSoup, Tag

from ..config import SIGAA_BASE_URL
from ..exceptions import SigaaParseError
from ..models import ClassroomPost, PostType
from ..utils.jsf import link_params
from ..utils.parsing import clean_text, parse_datetime, to_markdown

_TOPIC_DATES_RE = re.compile(
    r"^(.*?)\s*\((\d{2}/\d{2}/\d{4})\s*-\s*(\d{2}/\d{2}/\d{4})\)"
)
_CLOCK_RE = re.compile(r"^\d{2}:\d{2}$")


def _fingerprint(value: str) -> str:
    return sha256(value.encode()).hexdigest()


def _parse_topics(soup: BeautifulSoup) -> list[ClassroomPost]:
    form = soup.find("form", id="formAva")
    if not isinstance(form, Tag):
        raise SigaaParseError("Página principal da turma sem formAva.")
    posts = []
    for topic in form.select(".topico-aula"):
        heading = topic.select_one(".titulo")
        match = _TOPIC_DATES_RE.match(clean_text(heading)) if heading else None
        if match is None or not match.group(1).strip():
            raise SigaaParseError("Tópico de aula sem título ou período reconhecível.")
        title, start, end = match.groups()
        # A lista não expõe o ID do tópico; nunca use o índice instável do JSF.
        topic_id = f"topic:{_fingerprint(match.group(0))}"
        body = topic.select_one(".conteudotopico")
        content = BeautifulSoup(str(body), "lxml") if body else None
        if content is not None:
            for item in content.select(".item, script, .drag_indicator"):
                item.decompose()
        posts.append(
            ClassroomPost(
                id=topic_id,
                type=PostType.TOPIC,
                title=title.strip(),
                starts_on=parse_datetime(start, "%d/%m/%Y", "do tópico").date(),
                ends_on=parse_datetime(end, "%d/%m/%Y", "do tópico").date(),
                content=to_markdown(content) if content is not None else None,
            )
        )
        for item in topic.select(".item"):
            anchor = item.find("a")
            if not isinstance(anchor, Tag):
                continue
            name = clean_text(anchor)
            params = link_params(anchor)
            href = str(anchor.get("href") or "").strip()
            url = urljoin(SIGAA_BASE_URL, href)
            url = (
                url
                if href and href != "#" and urlsplit(url).scheme in ("https", "http")
                else None
            )
            source_id = params.get("id") or url
            if not name or source_id is None:
                raise SigaaParseError("Material do tópico sem título ou identificador.")
            description = item.select_one(".descricao-item")
            posts.append(
                ClassroomPost(
                    id=f"material:{_fingerprint(topic_id + ':' + source_id)}",
                    type=PostType.MATERIAL,
                    sigaa_id=params.get("id"),
                    topic_id=topic_id,
                    title=name,
                    content=to_markdown(description) if description else None,
                    url=url,
                )
            )
    if not posts and "não criou nenhum tópico" not in clean_text(form).lower():
        raise SigaaParseError("Página principal sem tópicos nem aviso de turma vazia.")
    return posts


def _parse_assessments(soup: BeautifulSoup) -> list[ClassroomPost]:
    legend = next(
        (
            tag
            for tag in soup.find_all("legend")
            if clean_text(tag) == "Datas de Avaliações"
        ),
        None,
    )
    fieldset = legend.find_parent("fieldset") if legend else None
    if not isinstance(fieldset, Tag):
        raise SigaaParseError("Listagem de datas de avaliações não encontrada.")
    posts = []
    for row in fieldset.select("table.listing tbody tr"):
        cells = row.find_all("td", recursive=False)
        anchor = row.find("a")
        source_id = link_params(anchor).get("id") if anchor else None
        if len(cells) < 3 or not source_id or not clean_text(cells[2]):
            raise SigaaParseError("Avaliação sem ID, data ou descrição na listagem.")
        day, hour = clean_text(cells[0]), clean_text(cells[1])
        posts.append(
            ClassroomPost(
                id=f"assessment:{source_id}",
                type=PostType.ASSESSMENT,
                sigaa_id=source_id,
                title=clean_text(cells[2]),
                content=clean_text(cells[2]),
                starts_on=parse_datetime(day, "%d/%m/%Y", "da avaliação").date(),
                starts_at=parse_datetime(
                    f"{day} {hour}", "%d/%m/%Y %H:%M", "da avaliação"
                )
                if _CLOCK_RE.fullmatch(hour)
                else None,
                time_label=hour or None,
            )
        )
    return posts
