import re
from collections import deque
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from api.db.models import Requirements, Subject
from api.db.seed import DATA_DIR, read_csv, upsert

SUBJECTS_CSV = DATA_DIR / "subjects.csv"
REQUIREMENTS = ("prerequisites", "corequisites", "equivalences")

_TOKEN = re.compile(r"[()]|[^\s()]+")
_OPERATORS = ("(", ")", "E", "OU")

type _Terms = list[tuple[str, ...]]


def read_subjects(path: Path = SUBJECTS_CSV) -> list[Subject]:
    """Os componentes do CSV (`code,name,hours,unity_id,prerequisites,...`)."""
    return read_csv(
        path,
        lambda row: Subject(
            code=row["code"].strip(),
            name=row["name"].strip(),
            hours=int(row["hours"]) if row["hours"] else None,
            unity_id=int(row["unity_id"]) if row["unity_id"] else None,
            **{field: parse_requirements(row[field]) for field in REQUIREMENTS},
        ),
        unique=(("code",),),
    )


async def seed_subjects(session: AsyncSession, path: Path = SUBJECTS_CSV) -> None:
    """As unidades precisam estar gravadas."""
    await upsert(
        session,
        Subject,
        read_subjects(path),
        ("code",),
        ("name", "hours", "unity_id", *REQUIREMENTS),
    )


def parse_requirements(expression: str) -> Requirements | None:
    """`( ( A E B ) OU ( C ) )` -> `[["A", "B"], ["C"]]`; E de OUs vira OU de Es."""
    tokens = deque(_TOKEN.findall(expression))
    if not tokens:
        return None
    try:
        terms = _or(tokens)
        if tokens:
            raise ValueError
    except ValueError, IndexError:
        raise ValueError(f"Requisito malformado: `{expression}`.") from None
    return [list(t) for t in dict.fromkeys(terms)]


def _or(tokens: deque[str]) -> _Terms:
    terms = _and(tokens)
    while tokens and tokens[0] == "OU":
        tokens.popleft()
        terms += _and(tokens)
    return terms


def _and(tokens: deque[str]) -> _Terms:
    terms = _atom(tokens)
    while tokens and tokens[0] == "E":
        tokens.popleft()
        right = _atom(tokens)
        terms = [tuple(dict.fromkeys(a + b)) for a in terms for b in right]
    return terms


def _atom(tokens: deque[str]) -> _Terms:
    token = tokens.popleft()
    if token == "(":
        terms = _or(tokens)
        if tokens.popleft() != ")":
            raise ValueError
        return terms
    if token in _OPERATORS:
        raise ValueError
    return [(token,)]
