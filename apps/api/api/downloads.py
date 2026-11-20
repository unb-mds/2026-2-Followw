from collections.abc import AsyncIterator
from urllib.parse import quote

from fastapi import Response
from fastapi.responses import StreamingResponse


def attachment(
    content: bytes | AsyncIterator[bytes],
    filename: str,
    content_type: str,
    response: Response,
) -> Response:
    """Resposta de download que mantém os cookies renovados em `response`."""
    headers = {
        "Content-Type": content_type,
        "Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename, safe='')}",
        "X-Content-Type-Options": "nosniff",
    }
    download = (
        Response(content, headers=headers)
        if isinstance(content, bytes)
        else StreamingResponse(content, headers=headers)
    )
    download.raw_headers.extend(response.raw_headers)
    return download
