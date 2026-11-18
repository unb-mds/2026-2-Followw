import httpx
from bs4 import BeautifulSoup

from sigaa_client import SigaaClient
from sigaa_client.config import CLASSROOM_HOME_PATH, CLASSROOMS_PATH
from sigaa_client.private.posts import _parse_topics

from ...fakes import FakeSigaa

CONTEXT = '<script>var nomeTurma = "Turma: FGA0146 - ESTRUTURAS DE DADOS 1 (2026.2 - T01)";</script>'
HISTORY = """
<form id="history" action="/sigaa/portais/discente/turmas.jsf">
<input name="javax.faces.ViewState" value="history-state">
<table class="listagem">
<tr><td class="periodo">2026.2</td></tr>
<tr><td>FGA0146 - ESTRUTURAS DE DADOS 1</td><td align="center">01</td>
<td align="right">60h</td><td>35M5</td><td>
<a title="Acessar Turma Virtual" onclick="jsfcljs(f,{'frontEndIdTurma':'AAA','history:enter':'history:enter'},'')">Entrar</a>
</td></tr></table></form>
"""
MENU = """
<form id="formMenu" action="/sigaa/ava/index.jsf">
<input name="javax.faces.ViewState" value="menu-state">
<a onclick="jsfcljs(f,{'formMenu:principal':'formMenu:principal'},'')">Principal</a>
</form>
"""


def topics(state: int = 1) -> str:
    return (
        CONTEXT
        + f"""
    <form id="unrelated"><input name="javax.faces.ViewState" value="wrong-state"></form>
    <form id="formAva" action="/sigaa/ava/index.jsf">
    <input name="javax.faces.ViewState" value="topics-{state}">
    <div class="topico-aula"><div class="titulo">Aula 1 (01/09/2026 - 01/09/2026)</div>
      <div class="item"><a href="#" onclick="jsfcljs(f,{{'formAva:{state}:first':'formAva:{state}:first','id':'101'}},'')">Notas.pdf</a></div>
      <div class="item"><a href="#" onclick="jsfcljs(f,{{'formAva:{state}:second':'formAva:{state}:second','id':'102'}},'')">Notas.pdf</a></div>
      <div class="item"><a href="https://example.org">Referência</a></div>
    </div>
    <div class="topico-aula"><div class="titulo">Aula 2 (02/09/2026 - 02/09/2026)</div>
      <div class="item"><a href="#" onclick="jsfcljs(f,{{'formAva:{state}:third':'formAva:{state}:third','id':'101'}},'')">Notas.pdf</a></div>
    </div></form>
    """
    )


POSTS = _parse_topics(BeautifulSoup(topics(), "lxml"))
MATERIAL_IDS = [post.id for post in POSTS if post.sigaa_id]


async def read_material(
    client: SigaaClient, material_id: str, classroom_id: str = "AAA"
) -> tuple[bytes, str, str]:
    async with client.classrooms.download_classroom_material(
        classroom_id, material_id
    ) as file:
        return (
            b"".join([chunk async for chunk in file.content]),
            file.filename,
            file.content_type,
        )


class MaterialSigaa(FakeSigaa):
    def __init__(self):
        super().__init__()
        self.entries = 0
        self.downloads: list[dict[str, str]] = []
        self.requests: list[httpx.Request] = []
        self.expire_download = False
        self.switch_context = False
        self.history = HISTORY
        self.initial: httpx.Response | None = None
        self.file = httpx.Response(
            200,
            content=b"%PDF-1.7 arquivo",
            headers={
                "content-type": "application/pdf",
                "content-disposition": "attachment; filename*=UTF-8''Anota%C3%A7%C3%B5es.pdf",
            },
        )

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if request.url.host == "arquivos.unb.br":
            return self.file
        response = super().__call__(request)
        if response.is_redirect or request.url.host != "sigaa.unb.br":
            return response
        if request.url.path == CLASSROOMS_PATH and request.method == "GET":
            return httpx.Response(200, text=self.history)
        if request.method == "GET" and request.url.path == CLASSROOM_HOME_PATH:
            return httpx.Response(200, text=MENU)
        if request.method == "POST":
            data = dict(httpx.QueryParams(request.content.decode()))
            if "frontEndIdTurma" in data:
                self.entries += 1
                return httpx.Response(200, text=CONTEXT)
            if "formMenu:principal" in data:
                page = topics(self.entries)
                if self.switch_context:
                    page = page.replace("T01", "T02")
                return httpx.Response(200, text=page)
            if "formAva" in data:
                self.downloads.append(data)
                if self.expire_download:
                    self.expire_download = False
                    self.valid_tokens.clear()
                    return httpx.Response(
                        302, headers={"location": "/sigaa/verTelaLogin.do"}
                    )
                if self.initial is not None:
                    return self.initial
                command = next(key for key in data if key.startswith("formAva:"))
                return httpx.Response(
                    200,
                    content=command.rsplit(":", 1)[-1].encode(),
                    headers={
                        "content-type": "application/octet-stream",
                        "content-disposition": "attachment",
                    },
                )
        return response
