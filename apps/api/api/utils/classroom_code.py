import re

CLASSROOM_CODE_PATTERN = r"^\s*[A-Za-z]+[0-9]+\s*$"
_CODE_RE = re.compile(CLASSROOM_CODE_PATTERN)


def classroom_code_prefix(code: str | None) -> str | None:
    normalized = (code or "").strip().upper()
    if _CODE_RE.fullmatch(normalized) is None:
        return None
    return normalized.rstrip("0123456789")
