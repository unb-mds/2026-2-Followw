from api.main import app
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

application = ProxyHeadersMiddleware(app, trusted_hosts="*")
