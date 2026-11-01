from collections.abc import Callable

from sigaa_client import lookup_key
from sqlalchemy import ColumnElement, and_, func, literal_column


def lookup_sql(value: ColumnElement[str]) -> ColumnElement[str]:
    without_accents = func.regexp_replace(
        func.normalize(func.lower(value), literal_column("NFKD")),
        r"[̀-ͯ]+",
        "",
        "g",
    )
    return func.regexp_replace(func.btrim(without_accents), r"\s+", " ", "g")


def contains_term(value: ColumnElement[str], term: str) -> ColumnElement[bool]:
    return lookup_sql(value).contains(term, autoescape=True)


def all_terms(
    q: str, match: Callable[[str], ColumnElement[bool]]
) -> ColumnElement[bool]:
    """Cada termo de `q`, sem acento nem caixa, precisa casar com `match`."""
    return and_(*(match(term) for term in lookup_key(q).split()))
