import base64
import hashlib
import json
import os
import time
from collections import deque
from http.cookies import SimpleCookie

import httpx
import jwt
import pytest
import respx
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sigaa_client import Credentials
from sigaa_client.config import CLASSROOMS_PATH

QSTASH_SIGNING_KEY = "sig_atual_de_teste_com_32_bytes_ou_mais"

# O `Settings` é instanciado no import de `api.core.config`, então as variáveis
# precisam existir antes de qualquer teste importar a app.
os.environ["ENVIRONMENT"] = "testing"
os.environ["DATABASE_URL"] = (
    "postgresql+asyncpg://postgres:postgres@localhost:5432/followw_test"
)
os.environ["JWT_SECRET_KEY"] = "chave-de-teste-nao-usar-em-producao"
os.environ["PUBLIC_URL"] = "https://api.followw.test"

os.environ["QSTASH_URL"] = "https://qstash.upstash.io"
os.environ["QSTASH_TOKEN"] = "token-de-teste"
os.environ["QSTASH_CURRENT_SIGNING_KEY"] = QSTASH_SIGNING_KEY
os.environ["QSTASH_NEXT_SIGNING_KEY"] = "sig_proxima_de_teste_com_32_bytes_ou_mais"

PERFIL = """
<html><body><div id="perfil-docente">
  <div class="info-docente"><p class="nome">NOME DISCENTE</p></div>
  <table>
    <tr><td>Matrícula:</td><td>251000000</td></tr>
    <tr><td>Curso:</td><td>ENGENHARIA DE SOFTWARE/FCTE - Bacharelado</td></tr>
    <tr><td>Nível:</td><td>GRADUAÇÃO</td></tr>
  </table>
</div></body></html>
"""

FORM_CAS = """
<html><body><form action="/sso-server/login;jsessionid=ABC?service=x" method="post">
  <input type="text" name="username" />
  <input type="password" name="password" />
  <input type="hidden" name="lt" value="LT-1" />
</form></body></html>
"""


class FakeSigaa:
    """SIGAA de mentira no nível HTTP: valida a senha e exige o JSESSIONID.

    A app monta o `SigaaClient` por conta própria, sem gancho para injetar um
    transport, então o dublê vive onde a app não manda: no socket.
    """

    def __init__(self, password: str = "senha123") -> None:
        self.password = password
        self.valid_tokens: set[str] = set()
        self.logins = 0
        self.logouts = 0
        # Dois jeitos de a outra ponta se comportar mal: sumir da rede
        # (`unavailable`) ou aceitar o login sem devolver o JSESSIONID
        # (`mode = "sem_cookie"`), que é como uma mudança de layout aparece.
        self.unavailable = False
        self.mode = "normal"
        self.profile = PERFIL
        self.profile_status = 200
        self.profile_requests = 0
        self.classrooms = '<html><body><table class="listagem"></table></body></html>'
        self.classrooms_status = 200
        self.classrooms_requests = 0

    def __call__(self, request: httpx.Request) -> httpx.Response:
        if self.unavailable:
            raise httpx.ConnectError("SIGAA fora do ar", request=request)

        if request.url.host == "autenticacao.unb.br":
            return self._cas(request)
        return self._sigaa(request)

    def _cas(self, request: httpx.Request) -> httpx.Response:
        if request.method == "GET":
            return httpx.Response(200, text=FORM_CAS)

        payload = dict(httpx.QueryParams(request.content.decode()))
        if payload.get("password") != self.password:
            # O CAS reexibe o próprio form: é assim que o client detecta a recusa.
            return httpx.Response(200, text=FORM_CAS)

        return httpx.Response(
            302,
            headers={"location": "https://sigaa.unb.br/sigaa/login/cas?ticket=ST-1"},
        )

    def _sigaa(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path

        if path == "/sigaa/login/cas":
            self.logins += 1
            token = f"app14~TOKEN{self.logins}"
            headers = {"location": "/sigaa/portais/discente/discente.jsf"}
            if self.mode != "sem_cookie":
                self.valid_tokens.add(token)
                headers["set-cookie"] = f"JSESSIONID={token}; Path=/"
            return httpx.Response(302, headers=headers)

        if path == "/sigaa/verTelaLogin.do":
            return httpx.Response(200, text=FORM_CAS)

        if path == "/sigaa/logar.do":
            self.logouts += 1
            self.valid_tokens.discard(_cookie(request, "JSESSIONID"))
            return httpx.Response(200, text="<html>saiu</html>")

        if _cookie(request, "JSESSIONID") not in self.valid_tokens:
            return httpx.Response(
                302, headers={"location": "https://sigaa.unb.br/sigaa/verTelaLogin.do"}
            )
        if path == CLASSROOMS_PATH:
            self.classrooms_requests += 1
            return httpx.Response(self.classrooms_status, text=self.classrooms)

        self.profile_requests += 1

        return httpx.Response(self.profile_status, text=self.profile)


def _cookie(request: httpx.Request, name: str) -> str | None:
    for part in request.headers.get("cookie", "").split(";"):
        key, _, value = part.strip().partition("=")
        if key == name:
            return value

    return None


@pytest.fixture
def sigaa():
    """Intercepta só o SIGAA e o CAS — o transport ASGI do TestClient passa reto."""
    fake = FakeSigaa()
    with respx.mock:
        respx.route(host__in=["sigaa.unb.br", "autenticacao.unb.br"]).mock(
            side_effect=fake
        )
        yield fake


class FakeQStash:
    """QStash de mentira: guarda o que a app publica e entrega em `POST /jobs`.

    Entrega cada mensagem uma vez, assinada como o QStash assinaria, sem
    retentativa nem deduplicação: essas regras ficam na conta do QStash.
    """

    def __init__(self) -> None:
        self.published: list[dict] = []
        self.pending: deque[dict] = deque()
        self.deliveries: list[httpx.Response] = []
        self.unavailable = False

    def __call__(self, request: httpx.Request) -> httpx.Response:
        if self.unavailable:
            return httpx.Response(500, json={"error": "fora do ar"})

        batch = json.loads(request.content)
        # O QStash de verdade recusa ':' na deduplicação.
        if any(":" in m["headers"].get("Upstash-Deduplication-Id", "") for m in batch):
            return httpx.Response(
                400, json={"error": "DeduplicationId cannot contain ':'"}
            )
        self.published.extend(batch)
        self.pending.extend(batch)
        return httpx.Response(
            200, json=[{"messageId": f"msg_{n}"} for n in range(len(batch))]
        )

    def deliver(self, client: TestClient) -> None:
        while self.pending:
            message = self.pending.popleft()
            url = message["destination"]
            response = client.post(
                httpx.URL(url).path,
                content=message["body"],
                headers={"Upstash-Signature": self.sign(url, message["body"])},
            )
            self.deliveries.append(response)

    @staticmethod
    def sign(url: str, body: str, key: str = QSTASH_SIGNING_KEY) -> str:
        """O `Upstash-Signature` que o QStash mandaria com este corpo."""
        digest = hashlib.sha256(body.encode()).digest()
        now = int(time.time())
        claims = {
            "iss": "Upstash",
            "sub": url,
            "exp": now + 300,
            "nbf": now,
            "body": base64.urlsafe_b64encode(digest).decode().rstrip("="),
        }
        return jwt.encode(claims, key, algorithm="HS256")


@pytest.fixture
def qstash():
    """Intercepta só a API do QStash; os outros hosts seguem para o próximo mock."""
    fake = FakeQStash()
    with respx.MockRouter(assert_all_called=False) as router:
        router.post(host="qstash.upstash.io", path="/v2/batch").mock(side_effect=fake)
        yield fake


class JobsClient(TestClient):
    """Entrega os jobs publicados antes de devolver a resposta, como o QStash faria."""

    def __init__(self, app: FastAPI, qstash: FakeQStash) -> None:
        super().__init__(app)
        self.qstash = qstash
        # O QStash não carrega os cookies do usuário.
        self._jobs = TestClient(app)

    def request(self, *args, **kwargs) -> httpx.Response:
        response = super().request(*args, **kwargs)
        self.qstash.deliver(self._jobs)
        return response


@pytest.fixture
def database(tmp_path):
    """Banco SQLite em arquivo: a app usa via aiosqlite, o teste via sessão síncrona."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from api.db.base import Base
    from api.db.models import User  # noqa: F401 — registra as tabelas no metadata

    engine = create_engine(f"sqlite:///{tmp_path / 'cache.db'}")
    Base.metadata.create_all(engine)
    yield sessionmaker(engine, expire_on_commit=False)
    engine.dispose()


@pytest.fixture
def async_database(database):
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlalchemy.pool import NullPool

    url = database.kw["bind"].url.set(drivername="sqlite+aiosqlite")
    # Sem pool: o TestClient abre um event loop novo a cada requisição.
    engine = create_async_engine(url, poolclass=NullPool)
    return async_sessionmaker(engine, expire_on_commit=False)


@pytest.fixture
def client(async_database, qstash):
    from api.db.main import get_sessionmaker
    from api.main import app

    app.dependency_overrides[get_sessionmaker] = lambda: async_database
    yield JobsClient(app, qstash)
    app.dependency_overrides.clear()


@pytest.fixture
def cookies():
    """Monta os cookies de sessão como a própria app os emitiria."""
    # Importado aqui dentro: `api.core.config` lê o ambiente já no import.
    from fastapi import Response

    from api.utils.session import set_access_cookie, set_refresh_cookie

    def _build(
        *, access: str | None = None, refresh: Credentials | None = None
    ) -> dict[str, str]:
        response = Response()
        if access is not None:
            set_access_cookie(response, access)
        if refresh is not None:
            set_refresh_cookie(response, refresh)
        return {nome: morsel.value for nome, morsel in _carregar(response).items()}

    return _build


def _carregar(response) -> SimpleCookie:
    headers = response.headers
    # `Response` do Starlette expõe `getlist`; o do httpx, `get_list`.
    brutos = (
        headers.get_list("set-cookie")
        if hasattr(headers, "get_list")
        else headers.getlist("set-cookie")
    )

    jar = SimpleCookie()
    for header in brutos:
        jar.load(header)
    return jar


@pytest.fixture
def ler_cookies():
    """Lê os `Set-Cookie` de uma resposta como um jar, com atributos e tudo."""
    return _carregar


@pytest.fixture
def probe_app():
    """Monta uma app isolada por teste para exercitar dependências sem rota.

    Um `include_router` na app global vazaria a rota de sonda para os outros
    testes e deixaria o resultado na mão da ordem de coleta.
    """

    def _build(handler) -> TestClient:
        app = FastAPI()
        app.get("/probe")(handler)
        return TestClient(app)

    return _build


@pytest.fixture
def stub_sigaa(monkeypatch):
    """Troca o `SigaaClient` por dublês de método, para testar o cache sem HTML.

    Só o client muda: conexão, cookies e tradução de erros continuam os da app.
    `created` conta quantos clients a app abriu.
    """
    from types import SimpleNamespace
    from unittest.mock import AsyncMock, Mock

    from sigaa_client import UserLevel, UserProfile

    client = SimpleNamespace(
        authenticate=AsyncMock(return_value="app14~STUB"),
        aclose=AsyncMock(),
        profile=SimpleNamespace(
            get_profile=AsyncMock(
                return_value=UserProfile(
                    name="NOME DISCENTE",
                    registration="251000000",
                    photo=None,
                    bio=None,
                    unity="FCTE",
                    course="ENGENHARIA DE SOFTWARE",
                    integralization=35,
                    ira=3.5,
                    mp=4.0,
                    level=UserLevel.GRADUACAO,
                )
            )
        ),
        classrooms=SimpleNamespace(
            list_classrooms=AsyncMock(return_value=[]),
            list_classroom_members=AsyncMock(return_value=[]),
            get_classroom_statistics=AsyncMock(return_value=()),
        ),
    )

    client.created = Mock(return_value=client)
    monkeypatch.setattr("api.dependencies.sigaa.SigaaClient", client.created)
    return client
