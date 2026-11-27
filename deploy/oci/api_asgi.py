from ipaddress import ip_address, ip_network
from pathlib import Path
from urllib.parse import urlsplit

from api.core.config import settings
from api.main import app
from starlette.datastructures import Headers
from starlette.responses import Response
from starlette.types import Receive, Scope, Send
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

_TRUSTED_PROXIES = [
    "127.0.0.1",
    "::1",
    "10.0.0.0/8",
    "172.16.0.0/12",
    "192.168.0.0/16",
    "fc00::/7",
]

_CLOUDFLARE = tuple(
    ip_network(cidr)
    for cidr in Path(__file__).with_name("cloudflare-cidrs.txt").read_text().split()
)
_JOBS_AUTHORITY = urlsplit(settings.qstash_jobs_url or "").netloc


async def _serve(scope: Scope, receive: Receive, send: Send) -> None:
    if scope["type"] != "http" or not scope.get("client"):
        await app(scope, receive, send)
        return

    headers = Headers(scope=scope)
    if _JOBS_AUTHORITY and scope["path"].rstrip("/") in {"/jobs", "/api/jobs"}:
        # A fila local usa chaves de desenvolvimento e só entrega pela rede Docker.
        if headers.get("host") != _JOBS_AUTHORITY or "x-forwarded-for" in headers:
            await Response(status_code=404)(scope, receive, send)
            return
        scope = {**scope, "scheme": "https"}
    elif visitor := headers.get("cf-connecting-ip"):
        try:
            edge = ip_address(scope["client"][0])
            if any(edge in network for network in _CLOUDFLARE):
                scope = {**scope, "client": (str(ip_address(visitor.strip())), 0)}
        except ValueError:
            pass

    await app(scope, receive, send)


application = ProxyHeadersMiddleware(_serve, trusted_hosts=_TRUSTED_PROXIES)
