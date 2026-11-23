from starlette._utils import get_route_path
from starlette.datastructures import Headers
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from api.core.config import settings
from api.modules.me.photo import MAX_PHOTO_BYTES
from api.modules.oauth.auth import parse_bearer_token

_MAX_BODY = MAX_PHOTO_BYTES + 64 * 1024


class ProfileUploadGuard:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if (
            scope["type"] != "http"
            or scope["method"] != "PATCH"
            or get_route_path(scope).rstrip("/") != "/me/profile"
        ):
            return await self.app(scope, receive, send)
        headers = Headers(scope=scope)
        origin = headers.get("origin", "")
        if origin not in settings.cors_origins and parse_bearer_token(headers) is None:
            return await JSONResponse(
                {"detail": "Origem não autorizada."}, status_code=403
            )(scope, receive, send)
        chunks = []
        size = 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            size += len(message.get("body", b""))
            if size > _MAX_BODY:
                return await JSONResponse(
                    {"detail": "A foto enviada deve ter até 4 MB."}, status_code=413
                )(scope, receive, send)
            chunks.append(message)
            if not message.get("more_body"):
                break

        async def bounded_receive():
            return chunks.pop(0) if chunks else await receive()

        await self.app(scope, bounded_receive, send)
