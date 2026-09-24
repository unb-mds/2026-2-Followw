"""Helpers de leitura de texto compartilhados entre os scrapers."""

import unicodedata


def clean_text(value: str) -> str:
    return " ".join(value.split())


def lookup_key(value: str) -> str:
    """Chave de lookup, sem acento e em minúscula: `Ceilândia` -> `ceilandia`."""
    normalized = unicodedata.normalize("NFKD", clean_text(value).lower())
    return "".join(c for c in normalized if not unicodedata.combining(c))
