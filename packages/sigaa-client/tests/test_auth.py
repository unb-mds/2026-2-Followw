import httpx
import pytest
from pydantic import SecretStr

from sigaa_client import (
    AuthenticationFailed,
    Credentials,
    SessionExpired,
    SigaaClient,
    SigaaParseError,
)
from sigaa_client.config import DASHBOARD_PATH

CREDENTIALS = Credentials(registration="251020208", password=SecretStr("senha"))

LOGIN_FORM = """
<html><body><form action="/sso-server/login;jsessionid=ABC?service=x" method="post">
  <input type="text" name="username" />
  <input type="password" name="password" />
  <input type="hidden" name="lt" value="LT-1" />
  <input type="submit" name="submit" value="Entrar" />
</form></body></html>
"""

LOGIN_URL = "https://autenticacao.unb.br/sso-server/login"


class FakeSigaa:
    """SIGAA de mentira: valida a senha, emite JSESSIONID e o exige depois."""

    def __init__(self, password: str = "senha", form: str = LOGIN_FORM) -> None:
        self.password = password
        self.form = form
        self.valid_tokens: set[str] = set()
        self.logins = 0
        self.payloads: list[dict[str, str]] = []

    @property
    def transport(self) -> httpx.MockTransport:
        return httpx.MockTransport(self)

    def __call__(self, request: httpx.Request) -> httpx.Response:
        host, path = request.url.host, request.url.path

        if host == "autenticacao.unb.br":
            if request.method == "GET":
                return httpx.Response(200, text=self.form)

            payload = dict(httpx.QueryParams(request.content.decode()))
            self.payloads.append(payload)
            if payload.get("password") != self.password:
                return httpx.Response(200, text=self.form)
            return httpx.Response(
                302,
                headers={
                    "location": "https://sigaa.unb.br/sigaa/login/cas?ticket=ST-1"
                },
            )

        if path == "/sigaa/login/cas":
            self.logins += 1
            token = f"app14~TOKEN{self.logins}"
            self.valid_tokens.add(token)
            return httpx.Response(
                302,
                headers={
                    "location": DASHBOARD_PATH,
                    "set-cookie": f"JSESSIONID={token}; Path=/",
                },
            )

        if path == "/sigaa/verTelaLogin.do":
            return httpx.Response(200, text=self.form)

        if path == "/sigaa/logar.do":
            self.valid_tokens.discard(
                request.headers.get("cookie", "").removeprefix("JSESSIONID=")
            )
            return httpx.Response(200, text="saiu")

        sent = _cookie(request, "JSESSIONID")
        if sent not in self.valid_tokens:
            return httpx.Response(
                302, headers={"location": "https://sigaa.unb.br/sigaa/verTelaLogin.do"}
            )
        return httpx.Response(200, text="<html>dashboard</html>")


def _cookie(request: httpx.Request, name: str) -> str | None:
    for part in request.headers.get("cookie", "").split(";"):
        key, _, value = part.strip().partition("=")
        if key == name:
            return value
    return None


async def test_authenticate_devolve_o_jsessionid():
    sigaa = FakeSigaa()
    async with SigaaClient(CREDENTIALS, transport=sigaa.transport) as client:
        token = await client.authenticate()

    assert token == "app14~TOKEN1"
    assert sigaa.payloads == [
        {"username": "251020208", "password": "senha", "lt": "LT-1", "submit": "Entrar"}
    ]


async def test_authenticate_nao_reloga_com_sessao_viva():
    sigaa = FakeSigaa()
    async with SigaaClient(CREDENTIALS, transport=sigaa.transport) as client:
        await client.authenticate()
        await client.authenticate()

    assert sigaa.logins == 1


async def test_client_reconstruido_a_partir_do_token():
    sigaa = FakeSigaa()
    async with SigaaClient(CREDENTIALS, transport=sigaa.transport) as client:
        token = await client.authenticate()

    async with SigaaClient(session_token=token, transport=sigaa.transport) as client:
        response = await client._session.get(DASHBOARD_PATH)

    assert response.status_code == 200
    assert sigaa.logins == 1  # não passou pelo CAS de novo


async def test_sessao_expirada_sem_credenciais():
    sigaa = FakeSigaa()
    async with SigaaClient(session_token="morto", transport=sigaa.transport) as client:
        with pytest.raises(SessionExpired):
            await client._session.get(DASHBOARD_PATH)


async def test_relogin_transparente_avisa_o_chamador():
    sigaa = FakeSigaa()
    renovados: list[str] = []

    async with SigaaClient(
        CREDENTIALS,
        session_token="morto",
        on_session_renewed=renovados.append,
        transport=sigaa.transport,
    ) as client:
        response = await client._session.get(DASHBOARD_PATH)
        assert client.session_token == renovados[0]

    assert response.status_code == 200
    assert renovados == ["app14~TOKEN1"]


async def test_relogin_aceita_callback_assincrono():
    sigaa = FakeSigaa()
    renovados: list[str] = []

    async def guardar(token: str) -> None:
        renovados.append(token)

    async with SigaaClient(
        CREDENTIALS,
        session_token="morto",
        on_session_renewed=guardar,
        transport=sigaa.transport,
    ) as client:
        await client._session.get(DASHBOARD_PATH)

    assert renovados == ["app14~TOKEN1"]


async def test_credenciais_invalidas():
    sigaa = FakeSigaa(password="outra")
    async with SigaaClient(CREDENTIALS, transport=sigaa.transport) as client:
        with pytest.raises(AuthenticationFailed):
            await client.authenticate()


async def test_form_do_cas_fora_do_esperado():
    sigaa = FakeSigaa(form="<html><body><p>manutenção</p></body></html>")
    async with SigaaClient(CREDENTIALS, transport=sigaa.transport) as client:
        with pytest.raises(SigaaParseError):
            await client.authenticate()


async def test_logout_descarta_o_token():
    sigaa = FakeSigaa()
    async with SigaaClient(CREDENTIALS, transport=sigaa.transport) as client:
        await client.authenticate()
        await client.logout()
        assert client.session_token is None


async def test_client_exige_credenciais_ou_token():
    with pytest.raises(ValueError):
        SigaaClient()
