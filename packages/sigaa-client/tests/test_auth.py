import asyncio

import httpx
import pytest
from pydantic import SecretStr

from sigaa_client import (
    AuthenticationFailed,
    Credentials,
    SessionExpired,
    SessionRenewed,
    SigaaClient,
    SigaaParseError,
)
from sigaa_client.config import CLASSROOMS_PATH, DASHBOARD_PATH

CREDENTIALS = Credentials(registration="251000000", password=SecretStr("senha"))

LOGIN_FORM = """
<html><body><form action="/sso-server/login;jsessionid=ABC?service=x" method="post">
  <input type="text" name="username" />
  <input type="password" name="password" />
  <input type="hidden" name="lt" value="LT-1" />
  <input type="submit" name="submit" value="Entrar" />
</form></body></html>
"""

# Recorte da resposta real do CAS a credenciais inválidas.
REJECTED_FORM = LOGIN_FORM.replace(
    'method="post">',
    'method="post">\n  <p id="errors" class="login-error">Credenciais inválidas.</p>',
)

LOGIN_URL = "https://autenticacao.unb.br/sso-server/login"


class FakeSigaa:
    """SIGAA de mentira: valida a senha, emite JSESSIONID e o exige depois."""

    def __init__(self, password: str = "senha", form: str = LOGIN_FORM) -> None:
        self.password = password
        self.form = form
        self.rejection = REJECTED_FORM
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
                return httpx.Response(200, text=self.rejection)
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
        {"username": "251000000", "password": "senha", "lt": "LT-1", "submit": "Entrar"}
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


async def test_sigaa_que_nao_abre_sessao_apos_o_cas_nao_e_senha_errada():
    sigaa = FakeSigaa()

    def handle(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/sigaa/login/cas":
            return httpx.Response(
                302,
                headers={
                    "location": "https://sigaa.unb.br/sigaa/verTelaLogin.do",
                    "set-cookie": "JSESSIONID=app14~SEMSESSAO; Path=/",
                },
            )
        return sigaa(request)

    transport = httpx.MockTransport(handle)
    async with SigaaClient(CREDENTIALS, transport=transport) as client:
        with pytest.raises(SigaaParseError, match="verTelaLogin"):
            await client.authenticate()


@pytest.mark.parametrize(
    "rejection",
    [
        LOGIN_FORM.replace(
            'method="post">',
            'method="post"><p id="errors">Esta conta foi bloqueada.</p>',
        ),
        LOGIN_FORM,
        "<html><body><h1>Erro interno</h1></body></html>",
    ],
)
async def test_outras_telas_do_cas_nao_sao_senha_errada(rejection):
    sigaa = FakeSigaa(password="outra")
    sigaa.rejection = rejection
    async with SigaaClient(CREDENTIALS, transport=sigaa.transport) as client:
        with pytest.raises(SigaaParseError, match="O CAS não liberou o login"):
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


async def test_form_do_cas_sem_campo_de_senha_e_barulhento():
    form = LOGIN_FORM.replace('type="password"', 'type="hidden"')
    sigaa = FakeSigaa(form=form)
    async with SigaaClient(CREDENTIALS, transport=sigaa.transport) as client:
        with pytest.raises(SigaaParseError, match="usuário/senha"):
            await client.authenticate()


async def test_login_sem_cookie_de_sessao_e_barulhento():
    sigaa = FakeSigaa()

    def handle(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/sigaa/login/cas":
            return httpx.Response(302, headers={"location": DASHBOARD_PATH})
        if request.url.path == DASHBOARD_PATH:
            return httpx.Response(200, text="<html>dashboard</html>")
        return sigaa(request)

    async with SigaaClient(CREDENTIALS, transport=httpx.MockTransport(handle)) as c:
        with pytest.raises(SigaaParseError, match="JSESSIONID"):
            await c.authenticate()


async def test_sessao_que_morre_logo_apos_o_relogin_e_barulhenta():
    sigaa = FakeSigaa()

    def handle(request: httpx.Request) -> httpx.Response:
        if request.url.path == CLASSROOMS_PATH:
            return httpx.Response(302, headers={"location": "/sigaa/verTelaLogin.do"})
        return sigaa(request)

    transport = httpx.MockTransport(handle)
    async with SigaaClient(
        CREDENTIALS, session_token="morto", transport=transport
    ) as c:
        with pytest.raises(SessionExpired, match="logo após o relogin"):
            await c._session.get(CLASSROOMS_PATH)
    assert sigaa.logins == 1


@pytest.mark.parametrize(
    "method,kwargs",
    [("POST", {}), ("GET", {"retry_on_renewal": False})],
)
async def test_operacao_com_estado_pede_para_ser_refeita_apos_o_relogin(method, kwargs):
    sigaa = FakeSigaa()
    async with SigaaClient(
        CREDENTIALS, session_token="morto", transport=sigaa.transport
    ) as client:
        with pytest.raises(SessionRenewed):
            await client._session.request(method, DASHBOARD_PATH, **kwargs)
        assert client.session_token == "app14~TOKEN1"


async def test_recuperacao_que_expira_de_novo_nao_reloga():
    sigaa = FakeSigaa()
    async with SigaaClient(
        CREDENTIALS, session_token="morto", transport=sigaa.transport
    ) as client:
        with pytest.raises(SessionExpired) as error:
            await client._session.get(DASHBOARD_PATH, allow_renewal=False)
    assert not isinstance(error.value, SessionRenewed)
    assert sigaa.logins == 0


async def test_requisicoes_simultaneas_com_sessao_morta_relogam_uma_vez():
    sigaa = FakeSigaa()
    mortas: list[str] = []
    todas_chegaram = asyncio.Event()

    async def handle(request: httpx.Request) -> httpx.Response:
        if _cookie(request, "JSESSIONID") == "morto":
            # Segura as três até todas verem a sessão morta.
            mortas.append(request.url.path)
            if len(mortas) == 3:
                todas_chegaram.set()
            await todas_chegaram.wait()
        return sigaa(request)

    async with SigaaClient(
        CREDENTIALS, session_token="morto", transport=httpx.MockTransport(handle)
    ) as client:
        respostas = await asyncio.gather(
            *(client._session.get(DASHBOARD_PATH) for _ in range(3))
        )

    assert [r.status_code for r in respostas] == [200, 200, 200]
    assert sigaa.logins == 1


async def test_erro_5xx_do_sigaa_nao_e_sessao_expirada():
    sigaa = FakeSigaa()
    sigaa.valid_tokens.add("vivo")

    def handle(request: httpx.Request) -> httpx.Response:
        if request.url.path == DASHBOARD_PATH:
            return httpx.Response(503, text="Service Unavailable")
        return sigaa(request)

    transport = httpx.MockTransport(handle)
    async with SigaaClient(CREDENTIALS, session_token="vivo", transport=transport) as c:
        with pytest.raises(httpx.HTTPStatusError):
            await c._session.get(DASHBOARD_PATH)
    assert sigaa.logins == 0


async def test_cas_fora_do_ar_nao_e_senha_errada():
    def handle(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="Erro interno")

    async with SigaaClient(CREDENTIALS, transport=httpx.MockTransport(handle)) as c:
        with pytest.raises(httpx.HTTPStatusError):
            await c.authenticate()


@pytest.mark.parametrize("error", [httpx.ConnectError, httpx.ReadTimeout])
async def test_falha_de_rede_chega_ao_chamador_como_erro_do_httpx(error):
    def handle(request: httpx.Request) -> httpx.Response:
        raise error("SIGAA fora do ar", request=request)

    transport = httpx.MockTransport(handle)
    async with SigaaClient(CREDENTIALS, session_token="vivo", transport=transport) as c:
        with pytest.raises(error):
            await c._session.get(DASHBOARD_PATH)
        # A falha de rede não derruba a sessão guardada.
        assert c.session_token == "vivo"
