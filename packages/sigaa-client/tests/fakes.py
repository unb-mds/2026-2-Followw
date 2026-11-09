import httpx
from pydantic import SecretStr

from sigaa_client import Credentials
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

REJECTED_FORM = LOGIN_FORM.replace(
    'method="post">',
    'method="post">\n  <p id="errors" class="login-error">Credenciais inválidas.</p>',
)

LOGIN_URL = "https://autenticacao.unb.br/sso-server/login"


def _cookie(request: httpx.Request, name: str) -> str | None:
    for part in request.headers.get("cookie", "").split(";"):
        key, _, value = part.strip().partition("=")
        if key == name:
            return value
    return None


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


class PagesSession:
    """Devolve uma página fixa por path, como as duas telas da listagem."""

    def __init__(self, pages: dict[str, str]) -> None:
        self.pages = pages

    async def get(self, url: str, **_: object) -> httpx.Response:
        return httpx.Response(200, text=self.pages[url])


class FakeSession:
    """Só o suficiente para o ritual do menu: uma página no GET, outra no POST."""

    def __init__(self, page: str, result: str = "") -> None:
        self.page = page
        self.result = result
        self.payload: dict[str, str] = {}

    async def get(self, url: str, **_: object) -> httpx.Response:
        return httpx.Response(200, text=self.page)

    async def post(self, url: str, data: dict[str, str], **_: object) -> httpx.Response:
        self.payload = data
        return httpx.Response(200, text=self.result)


class SharedSession:
    """Entra na turma pedida, mas a tela sai na turma em que outro uso da sessão a deixou."""

    def __init__(self, *screens: str, history: str = "") -> None:
        self.screens = list(screens)
        self.history = history
        self.entries = 0

    async def get(self, url: str, **_: object) -> httpx.Response:
        if url == CLASSROOMS_PATH:
            return httpx.Response(200, text=self.history)
        return httpx.Response(200, text=self.screens.pop(0))

    async def post(self, url: str, **_: object) -> httpx.Response:
        self.entries += 1
        return httpx.Response(200, text="")


class NewsSession:
    """O menu da turma no GET; depois, uma resposta por postback, na ordem."""

    def __init__(self, *results: str, home: str = "") -> None:
        self.results = list(results)
        self.home = home
        self.payloads: list[dict[str, str]] = []

    async def get(self, url: str, **_: object) -> httpx.Response:
        return httpx.Response(200, text=self.home)

    async def post(self, url: str, data: dict[str, str], **_: object) -> httpx.Response:
        self.payloads.append(data)
        return httpx.Response(200, text=self.results.pop(0))


def details_page(
    code: str = "0003",
    name: str = "COMPILADORES 1",
    *,
    unit: str = "CAMPUS UNB GAMA",
    total: str = "90h",
    **requirements: object,
) -> str:
    fields = {
        "Unidade Responsável:": unit,
        "Código:": code,
        "Nome:": name,
        "Pré-Requisitos:": requirements.get("pre", "-"),
        "Co-Requisitos:": requirements.get("co", "-"),
        "Equivalências:": requirements.get("equivalences", "-"),
    }
    rows = "".join(
        f"<tr><th>{label}</th><td>{value}</td></tr>"
        for label, value in fields.items()
        if value is not None
    )
    return f"""
    <table class="visualizacao">
      {rows}
      <tr><th>Carga Horária:</th><td>{total}</td></tr>
    </table>
    """
