from starlette._utils import get_route_path
from starlette.datastructures import Headers
from starlette.middleware.cors import CORSMiddleware
from starlette.types import ASGIApp, Receive, Scope, Send


class FollowwCORS:
    """Cookies usam as origens do Followw; apps OAuth fazem fetch com credentials: omit."""

    def __init__(self, app: ASGIApp, origins: list[str]):
        self.origins = frozenset(origins)
        exposed = ["Age", "Retry-After", "WWW-Authenticate"]
        session_exposed = [*exposed, "X-Followw-Access", "X-Followw-Refresh"]
        self.session = CORSMiddleware(
            app,
            allow_origins=origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
            expose_headers=session_exposed,
        )
        self.oauth = CORSMiddleware(
            app,
            allow_origins=["*"],
            allow_methods=["*"],
            allow_headers=["Authorization", "DPoP", "Content-Type", "Cache-Control"],
            expose_headers=exposed,
        )

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and self._is_oauth(scope):
            await self.oauth(scope, receive, send)
            return
        await self.session(scope, receive, send)

    def _is_oauth(self, scope: Scope) -> bool:
        headers = Headers(scope=scope)
        origin = headers.get("origin")
        if origin is None or origin in self.origins or "cookie" in headers:
            return False
        if get_route_path(scope).rstrip("/") == "/oauth/token":
            return True
        names = (
            {
                name.strip().lower()
                for name in headers.get("access-control-request-headers", "").split(",")
            }
            if scope["method"] == "OPTIONS"
            else set(headers)
        )
        return "authorization" in names or "dpop" in names
