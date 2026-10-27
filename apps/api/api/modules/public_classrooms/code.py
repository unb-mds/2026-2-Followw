import re
from typing import Annotated

from pydantic import StringConstraints

CLASSROOM_CODE_PATTERN = r"^\s*[A-Za-z]+[0-9]+\s*$"
_CODE_RE = re.compile(CLASSROOM_CODE_PATTERN)

ClassroomCode = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, to_upper=True, pattern=CLASSROOM_CODE_PATTERN
    ),
]


def classroom_code_prefix(code: str | None) -> str | None:
    normalized = (code or "").strip().upper()
    if _CODE_RE.fullmatch(normalized) is None:
        return None
    return normalized.rstrip("0123456789")
