"""Helpers de leitura de HTML compartilhados entre os resources."""

import re

from bs4 import BeautifulSoup, Tag

_DATE_RANGE_RE = re.compile(r"\s*\([^)]*\)\s*")


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
