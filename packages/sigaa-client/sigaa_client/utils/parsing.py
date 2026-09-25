"""Helpers de leitura de HTML compartilhados entre os resources."""

import re
import unicodedata
from datetime import datetime
from urllib.parse import urljoin, urlsplit

from bs4 import BeautifulSoup, Tag
from markdownify import ATX, BACKSLASH, MarkdownConverter

from ..config import SIGAA_BASE_URL
from ..exceptions import SigaaParseError

_DATE_RANGE_RE = re.compile(r"\s*\([^)]*\)\s*")
_TRAILING_SPACES_RE = re.compile(r"[ \t]+$", re.MULTILINE)
_BLANK_LINES_RE = re.compile(r"\n{3,}")
# O texto é escrito pelo docente: `javascript:` e afins não podem virar link.
_SAFE_SCHEMES = {"http", "https", "mailto"}
# `<br>` no começo ou no fim de parágrafo vira um `\` solto junto da linha em branco.
_DANGLING_BREAKS_RE = re.compile(
    r"\n*(?:\\\n)+\n+|\n\n(?:\\\n)+|^(?:\\\n)+|(?:\\\n)*\\$"
)

# Quebra de linha com `\` em vez de dois espaços, que a limpeza de fim de linha apagaria.
_MARKDOWN = MarkdownConverter(heading_style=ATX, bullets="-", newline_style=BACKSLASH)


def clean_text(node: Tag) -> str:
    return " ".join(node.get_text(" ", strip=True).split())


def visible_text(node: Tag) -> str:
    """O mesmo texto, sem os balões de ajuda que o SIGAA embute na célula."""
    copy = BeautifulSoup(str(node), "lxml")
    for popup in copy.select(".popUp"):
        popup.decompose()
    return clean_text(copy)


def split_course(value: str) -> tuple[str, str | None]:
    """`ENGENHARIA DE SOFTWARE/FCTE - Bacharelado` -> curso e unidade."""
    course, separator, rest = value.partition("/")
    if not separator:
        return value.strip(), None
    return course.strip(), rest.split("-")[0].strip() or None


def split_location(value: str) -> tuple[str | None, str | None]:
    """`FCTE - MOCAP` -> unidade e sala."""
    unity, separator, room = value.partition(" - ")
    if not separator:
        return None, unity.strip() or None
    return unity.strip() or None, room.strip() or None


def schedule_code(value: str) -> str | None:
    """`35M5 35T1 (10/08/2026 - 14/12/2026)` -> `35M5 35T1`."""
    return _DATE_RANGE_RE.sub(" ", value).strip() or None


def lookup_key(value: str) -> str:
    """Chave de lookup, sem acento e em minúscula."""
    normalized = unicodedata.normalize("NFKD", value.strip().lower())
    return "".join(c for c in normalized if not unicodedata.combining(c))


def parse_datetime(value: str, fmt: str, where: str) -> datetime:
    """O SIGAA não expõe timezone; a data é sempre a do calendário da UnB."""
    try:
        return datetime.strptime(value, fmt)  # noqa: DTZ007
    except ValueError as error:
        raise SigaaParseError(
            f"Data `{value}` {where} em formato inesperado."
        ) from error


def to_markdown(node: Tag) -> str | None:
    """HTML do editor do SIGAA -> markdown, sem estilos, `&nbsp;` nem parágrafos vazios."""
    copy = BeautifulSoup(str(node), "lxml")
    for tag in copy.find_all(href=True):
        href = _safe_url(str(tag["href"]))
        if href is None:
            del tag["href"]
        else:
            tag["href"] = href
        del tag["title"]
    for tag in copy.find_all(src=True):
        src = _safe_url(str(tag["src"]))
        if src is None:
            tag.decompose()
        else:
            tag["src"] = src

    text = _MARKDOWN.convert_soup(copy).replace("\xa0", " ")
    text = _TRAILING_SPACES_RE.sub("", text).strip()
    text = _DANGLING_BREAKS_RE.sub("\n\n", text).strip()
    return _BLANK_LINES_RE.sub("\n\n", text) or None


def _safe_url(value: str) -> str | None:
    url = urljoin(SIGAA_BASE_URL, value.strip())
    return url if urlsplit(url).scheme.lower() in _SAFE_SCHEMES else None
