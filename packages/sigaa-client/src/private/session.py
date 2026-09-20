import asyncio
import inspect
from collections.abc import Awaitable, Callable
from typing import Any
from urllib.parse import urlencode, urljoin

import httpx
from bs4 import BeautifulSoup

from ..config import (
    CAS_BASE_URL,
    CAS_LOGIN_URL,
    CAS_SERVICE_URL,
    LOGOUT_PATH,
    SESSION_COOKIE_NAME,
    SIGAA_COOKIE_DOMAIN,
)
from ..exceptions import (
    AuthenticationFailed,
    SessionExpired,
    SessionRenewed,
    SigaaParseError,
)
from ..models import Credentials

OnSessionRenewed = Callable[[str], None | Awaitable[None]]

# Telas para onde o SIGAA joga quem chega sem sessão válida.
_UNAUTHENTICATED_PATHS = (
    "/sso-server/login",
    "/sigaa/logar.do",
    "/sigaa/verTelaLogin.do",
)


class Session:
    def __init__(
        self,
        http: httpx.AsyncClient,
        credentials: Credentials | None = None,
        session_token: str | None = None,
        on_session_renewed: OnSessionRenewed | None = None,
    ) -> None:
        self._http = http
        self._credentials = credentials
        self._on_session_renewed = on_session_renewed
        self._token: str | None = None
        self._lock = asyncio.Lock()

        if session_token is not None:
            self._store_token(session_token)

    @property
    def token(self) -> str | None:
        return self._token

    async def authenticate(self) -> str:
        if self._token is not None:
            return self._token

        async with self._lock:
            if self._token is not None:
                return self._token
            return await self._login()

    async def request(
        self,
        method: str,
        url: str,
        *,
        retry_on_renewal: bool = True,
        allow_renewal: bool = True,
        **kwargs: Any,
    ) -> httpx.Response:
        stale_token = await self.authenticate()

        response = await self._http.request(method, url, **kwargs)
        if not _is_unauthenticated(response):
            response.raise_for_status()
            return response

        if not allow_renewal:
            raise SessionExpired("Sessão expirou novamente durante a recuperação.")

        await self._renew(stale_token=stale_token)
        # POSTs e leituras que dependem da turma aberta perdem seu estado no relogin.
        if method.upper() not in ("GET", "HEAD") or not retry_on_renewal:
            raise SessionRenewed("Refaça a operação com o estado da nova sessão.")

        response = await self._http.request(method, url, **kwargs)
        if _is_unauthenticated(response):
            raise SessionExpired(
                "Sessão continua inválida logo após o relogin — "
                f"o SIGAA devolveu {response.url}."
            )

        response.raise_for_status()
        return response

    async def get(self, url: str, **kwargs: Any) -> httpx.Response:
        return await self.request("GET", url, **kwargs)

    async def post(self, url: str, **kwargs: Any) -> httpx.Response:
        return await self.request("POST", url, **kwargs)

    async def logout(self) -> None:
        if self._token is None:
            return
        try:
            response = await self._http.get(LOGOUT_PATH)
            response.raise_for_status()
        finally:
            self._token = None
            self._http.cookies.clear()

    async def _renew(self, stale_token: str | None) -> str:
        async with self._lock:
            if self._token is not None and self._token != stale_token:
                return self._token
            if self._credentials is None:
                raise SessionExpired(
                    "Sessão expirada e o client foi construído sem credenciais "
                    "— não há como reautenticar."
                )
            token = await self._login()
            await self._notify(token)
            return token

    async def _login(self) -> str:
        if self._credentials is None:
            raise SessionExpired("Não há credenciais para iniciar outra sessão.")

        self._http.cookies.clear()
        self._token = None

        service = urlencode({"service": CAS_SERVICE_URL})
        page = await self._http.get(f"{CAS_LOGIN_URL}?{service}")
        page.raise_for_status()

        action, payload = _build_login_payload(
            page.text,
            base_url=str(page.url),
            registration=self._credentials.registration,
            password=self._credentials.password.get_secret_value(),
        )

        response = await self._http.post(action, data=payload)
        response.raise_for_status()

        if CAS_BASE_URL in str(response.url):
            raise AuthenticationFailed("Matrícula ou senha inválida.")

        token = self._read_token_from_jar()
        if token is None:
            raise SigaaParseError(
                "Login aceito pelo CAS, mas o SIGAA não devolveu o cookie "
                f"{SESSION_COOKIE_NAME} (fim do fluxo em {response.url})."
            )

        self._token = token
        return token

    def _store_token(self, token: str) -> None:
        self._token = token
        self._http.cookies.set(
            SESSION_COOKIE_NAME, token, domain=SIGAA_COOKIE_DOMAIN, path="/"
        )

    def _read_token_from_jar(self) -> str | None:
        for cookie in self._http.cookies.jar:
            domain = cookie.domain.lstrip(".")
            if cookie.name == SESSION_COOKIE_NAME and (
                domain == SIGAA_COOKIE_DOMAIN
                or domain.endswith(f".{SIGAA_COOKIE_DOMAIN}")
            ):
                return cookie.value
        return None

    async def _notify(self, token: str) -> None:
        if self._on_session_renewed is None:
            return
        result = self._on_session_renewed(token)
        if inspect.isawaitable(result):
            await result


def _is_unauthenticated(response: httpx.Response) -> bool:
    url = str(response.url)
    return any(path in url for path in _UNAUTHENTICATED_PATHS)


def _build_login_payload(
    html: str, base_url: str, registration: str, password: str
) -> tuple[str, dict[str, str]]:
    form = BeautifulSoup(html, "lxml").find("form")
    if form is None:
        raise SigaaParseError("Formulário de login não encontrado na tela do CAS.")

    payload: dict[str, str] = {}
    has_user = has_password = False

    for field in form.find_all("input"):
        name = field.get("name")
        if not name:
            continue
        kind = (field.get("type") or "text").lower()
        if kind == "password":
            payload[name] = password
            has_password = True
        elif kind == "text":
            payload[name] = registration
            has_user = True
        else:
            payload[name] = field.get("value", "")

    if not (has_user and has_password):
        raise SigaaParseError(
            "Campos de usuário/senha não encontrados no form do CAS "
            "— layout provavelmente mudou."
        )

    return urljoin(base_url, form.get("action") or base_url), payload
