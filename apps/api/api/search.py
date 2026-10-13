import unicodedata


def normalize_search(value: str) -> str:
    """Normaliza caixa, acentos e espaços para os filtros locais da API."""
    normalized = unicodedata.normalize("NFKD", value.casefold())
    return " ".join(
        "".join(char for char in normalized if not unicodedata.combining(char)).split()
    )
