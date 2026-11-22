from starlette.datastructures import Headers
from starlette.middleware.cors import CORSMiddleware
from starlette.types import ASGIApp, Receive, Scope, Send


class FollowwCORS:
    """Cookies usam as origens do Followw; apps OAuth fazem fetch com credentials: omit."""

    def __init__(self, app: ASGIApp, origins: list[str]):
        self.origins = frozenset(origins)
        exposed = ["Age", "Retry-After", "WWW-Authenticate"]
        self.session = CORSMiddleware(
            app,
            allow_origins=origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
            expose_headers=exposed,
        )
        self.oauth = CORSMiddleware(
            app,
            allow_origins=["*"],
            allow_methods=["*"],
            allow_headers=["Authorization", "DPoP", "Content-Type", "Cache-Control"],
            expose_headers=exposed,
        )

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            headers = Headers(scope=scope)
            origin = headers.get("origin")
            if (
                origin is not None
                and origin not in self.origins
                and "cookie" not in headers
            ):
                names = set(headers)
                if scope["method"] == "OPTIONS":
                    names = {
                        name.strip().lower()
                        for name in headers.get(
                            "access-control-request-headers", ""
                        ).split(",")
                    }
                if "authorization" in names or "dpop" in names:
                    await self.oauth(scope, receive, send)
                    return
        await self.session(scope, receive, send)
