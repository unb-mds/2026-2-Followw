from sqlalchemy import ColumnElement, func, literal_column


def lookup_sql(value: ColumnElement[str]) -> ColumnElement[str]:
    without_accents = func.regexp_replace(
        func.normalize(func.lower(value), literal_column("NFKD")),
        r"[\u0300-\u036f]+",
        "",
        "g",
    )
    return func.regexp_replace(func.btrim(without_accents), r"\s+", " ", "g")
