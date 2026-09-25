from collections.abc import Sequence
from datetime import date, datetime
from io import BytesIO

import httpx
import pytest
from bs4 import BeautifulSoup
from PIL import Image

from sigaa_client import (
    AttendanceStatus,
    ClassroomNotFound,
    ClassroomProgress,
    ClassroomRole,
    NewsNotFound,
    StudentSituation,
)
from sigaa_client.config import (
    CLASSROOMS_PATH,
    DASHBOARD_PATH,
    PARTICIPANTS_PATH,
    PARTICIPANTS_TIMEOUT,
    SIGAA_BASE_URL,
)
from sigaa_client.exceptions import SigaaParseError
from sigaa_client.private.classrooms import (
    _GLYPHS,
    Classrooms,
    _assert_context,
    _chart_source,
    _legend_percentages,
    _merge,
    _news_fieldset,
    _open_frequency,
    _open_news_detail,
    _open_statistics,
    _parse_dashboard,
    _parse_frequency,
    _parse_history,
    _parse_members,
    _parse_news_detail,
    _parse_news_list,
    _parse_statistics,
)
from sigaa_client.private.session import Session

HISTORY = """
<html><body><table class="listagem">
  <tr><td class="periodo" colspan="6">2026.2</td></tr>
  <tr>
    <td>FGA0146 - ESTRUTURAS DE DADOS 1</td><td align="center">01</td>
    <td align="right">60h</td><td>35M5  35T1 (10/08/2026 - 14/12/2026)</td>
    <td><a href="#" title="Acessar Turma Virtual"
      onclick="jsfcljs(x,{'form:link':'form:link','frontEndIdTurma':'AAA','inciadoPelaBusca':'true'},'');"
    ><img/></a></td>
  </tr>
  <tr><td class="periodo" colspan="6">2025.2</td></tr>
  <tr>
    <td>FGA0158 - ORIENTAÇÃO A OBJETOS</td><td align="center">02</td>
    <td align="right">30h</td><td>24T23</td>
    <td><a href="#" title="Acessar Turma Virtual"
      onclick="jsfcljs(x,{'frontEndIdTurma':'BBB'},'');"><img/></a></td>
  </tr>
</table></body></html>
"""

DASHBOARD = """
<html><body><table>
  <tr><td colspan="5">2026.2</td></tr>
  <tr class="odd">
    <td class="descricao">
      <form id="form_acessarTurmaVirtual" name="form_acessarTurmaVirtual">
        <a href="#" onclick="jsfcljs(x,{'frontEndIdTurma':'AAA'},'');">ESTRUTURAS DE DADOS 1</a>
      </form>
    </td>
    <td class="info">FCTE - MOCAP</td>
    <td class="info"><center>35M5  35T1 (10/08/2026 - 14/12/2026)
      <span><div class="popUp" id="ajuda1">Terça-feira 12:00 às 13:50</div></span>
    </center></td>
    <td></td>
  </tr>
  <tr><td colspan="5" id="linha_1617644" style="display: none;"></td></tr>
</table></body></html>
"""

PARTICIPANTS = """
<html><body>
<fieldset><legend> Docentes (1)</legend></fieldset>
<table class="participantes"><tr>
  <td align="center" width="72"><img src="https://arquivos.unb.br/arquivos/abc/foto.jpg"/></td>
  <td valign="top">
  <strong><a href="/sigaa/public/docente/portal.jsf?siape=$?siape=1984632">NOME DOCENTE</a></strong><br/>
  Departamento: <em>CAMPUS UNB GAMA: FCTE</em><br/>
  Formação: <em>DOUTORADO</em><br/>
  Usuário(a): <em>82766657134</em><br/>
  E-Mail: <em>docente@unb.br</em><br/>
</td></tr></table>
<fieldset><legend> Discentes (1)</legend></fieldset>
<table class="participantes"><tr>
  <td width="47"><img src="/sigaa/img/no_picture.png"/></td>
  <td valign="top">
  <strong>NOME DISCENTE
    <a href="#" onclick="A4J.AJAX.Submit('x',event,{'parameters':{'idPessoa':2660998}});">perfil</a>
  </strong><br/>
  Curso: <em>ENGENHARIA DE SOFTWARE/FCTE </em><br/>
  Matrícula: <em>251034885</em><br/>
  Usuário(a): <em>251034885 </em><br/>
  E-mail: <em>discente@example.com </em>
</td></tr></table>
</body></html>
"""


def test_history_traz_codigo_carga_horaria_e_periodo():
    turmas = _parse_history(HISTORY)

    assert list(turmas) == ["AAA", "BBB"]
    turma = turmas["AAA"]
    assert (turma.number, turma.semester) == ("01", "2026.2")
    assert turma.schedule == "35M5 35T1"
    assert (turma.subject.code, turma.subject.hours) == ("FGA0146", 60)
    assert turmas["BBB"].semester == "2025.2"


def test_dashboard_traz_local_e_id_numerico():
    turma = _parse_dashboard(DASHBOARD)["AAA"]

    assert turma.sigaa_id == 1617644
    assert (turma.subject.unity, turma.room) == ("FCTE", "MOCAP")
    # O balão de ajuda não pode vazar para o horário.
    assert turma.schedule == "35M5 35T1"


def test_merge_completa_o_historico_com_o_portal():
    turma = _merge(_parse_history(HISTORY)["AAA"], _parse_dashboard(DASHBOARD)["AAA"])

    assert turma.subject.code == "FGA0146"
    assert (turma.room, turma.sigaa_id) == ("MOCAP", 1617644)


def test_dashboard_sem_turmas_nao_quebra():
    assert _parse_dashboard("<html><body></body></html>") == {}


class PagesSession:
    """Devolve uma página fixa por path, como as duas telas da listagem."""

    def __init__(self, pages: dict[str, str]) -> None:
        self.pages = pages

    async def get(self, url: str, **_: object) -> httpx.Response:
        return httpx.Response(200, text=self.pages[url])


async def test_historico_completo_marca_as_turmas_atuais():
    so_no_portal = DASHBOARD.replace("'AAA'", "'CCC'")
    session = PagesSession({CLASSROOMS_PATH: HISTORY, DASHBOARD_PATH: DASHBOARD})

    turmas = await Classrooms(session).list_classrooms()  # type: ignore[arg-type]
    session.pages[DASHBOARD_PATH] = so_no_portal
    com_extra = await Classrooms(session).list_classrooms()  # type: ignore[arg-type]

    assert [(t.id, t.current) for t in turmas] == [("AAA", True), ("BBB", False)]
    assert [(t.id, t.current) for t in com_extra] == [
        ("AAA", False),
        ("BBB", False),
        ("CCC", True),
    ]


async def test_turmas_atuais_so_leem_o_portal():
    session = PagesSession({DASHBOARD_PATH: DASHBOARD})

    turmas = await Classrooms(session).list_current_classrooms()  # type: ignore[arg-type]

    assert [(t.id, t.sigaa_id) for t in turmas] == [("AAA", 1617644)]


async def test_turma_fora_do_historico_nao_e_erro_de_layout():
    session = PagesSession({CLASSROOMS_PATH: HISTORY})

    with pytest.raises(ClassroomNotFound):
        await Classrooms(session).list_classroom_news("CCC")  # type: ignore[arg-type]


def test_participantes_separam_docente_de_discente():
    soup = BeautifulSoup(PARTICIPANTS, "lxml")

    docente = _parse_members(soup, "Docentes", ClassroomRole.PROFESSOR)[0]
    assert docente.registration is None  # o "Usuário(a)" do docente é o CPF
    assert "82766657134" not in docente.model_dump_json()
    assert docente.email == "docente@unb.br"
    assert docente.photo == "https://arquivos.unb.br/arquivos/abc/foto.jpg"

    discente = _parse_members(soup, "Discentes", ClassroomRole.ALUNO)[0]
    assert discente.registration == "251034885"
    assert (discente.course, discente.unity) == ("ENGENHARIA DE SOFTWARE", "FCTE")
    assert discente.person_id == 2660998
    assert discente.photo is None  # no_picture.png não é foto


def test_lista_ausente_e_barulhenta():
    soup = BeautifulSoup("<html><body></body></html>", "lxml")

    with pytest.raises(SigaaParseError):
        _parse_members(soup, "Discentes", ClassroomRole.ALUNO)


FREQUENCY = """
<html><body>
<div id="barraDireita">
  <div class="rich-stglpanel-header">Andamento das Aulas </div>
  <div class="rich-stglpanel-body">
    <div>Aulas (Ministradas/Total): <i>24 / 72</i></div>
    <div class="progress"><div class="progress-bar" style="width: 33.3%;">33%</div></div>
    <div>% de Carga Horária Ministrada</div>
  </div>
</div>
<div id="conteudo"><fieldset><legend> Mapa de Frequências </legend>
<table class="listing">
  <thead><tr><th>Data</th><th>Situação</th></tr></thead>
  <tbody>
    <tr><td class="first">11/08/2026</td><td> Presente </td></tr>
    <tr><td class="first">20/08/2026</td><td> 2 Falta(s) </td></tr>
    <tr><td class="first">25/08/2026</td><td> Não Registrada </td></tr>
  </tbody>
</table>
<div class="botoes-show">
  <b>Presenças Registradas:</b> 63<br/>
  <span><b>Número de Aulas com Registro de Frequência:</b> 65</span><br/>
  <b>Porcentagem de Frequência em relação as Aulas com Registro de Frequência:</b> 96%
  <br/>
  <b>Número de Aulas definidas pela CH do Componente:</b> 72<br/>
  <b>Porcentagem de Frequência em relação a CH:</b> 87%
</div>
</fieldset></div>
</body></html>
"""

NOT_LAUNCHED = """
<html><body>
<div class="rich-stglpanel-header">Andamento das Aulas </div>
<div class="rich-stglpanel-body">
  <div>Aulas (Ministradas/Total): <i>10 / 32</i></div>
  <div class="progress"><div class="progress-bar" style="width: 31.2%;">31%</div></div>
</div>
<div id="conteudo"><fieldset><legend> Mapa de Frequências </legend>
<span style="color:#C00;">A frequência ainda não foi lançada.</span>
<div class="botoes-show">
  <b>Presenças Registradas:</b> 32<br/>
  <span><b>Número de Aulas com Registro de Frequência:</b> 32</span><br/>
  <b>Porcentagem de Frequência em relação as Aulas com Registro de Frequência:</b> 100%
  <br/>
  <b>Número de Aulas definidas pela CH do Componente:</b> 32<br/>
  <b>Porcentagem de Frequência em relação a CH:</b> 100%
</div>
</fieldset></div>
</body></html>
"""

CLASSROOM_HOME = """
<html><body>
<form id="formMenu" name="formMenu" action="/sigaa/ava/index.jsf">
  <a href="#" onclick="jsfcljs(document.getElementById('formMenu'),
    {'formMenu:j_id_jsp_97':'formMenu:j_id_jsp_97'},'');">Frequência</a>
  <a href="#" onclick="jsfcljs(document.getElementById('formMenu'),
    {'formMenu:j_id_jsp_142':'formMenu:j_id_jsp_142'},'');">Situação dos Discentes</a>
  <a href="#" onclick="jsfcljs(document.getElementById('formMenu'),
    {'formMenu:j_id_jsp_88':'formMenu:j_id_jsp_88'},'');">
    <div class="itemMenu">Notícias</div></a>
  <input name="javax.faces.ViewState" type="hidden" value="j_id6"/>
</form>
</body></html>
"""

STATISTICS_SCREEN = """
<html><body><div id="conteudo"><fieldset><legend>Estatísticas da Turma</legend>
<center><img alt="" src="/sigaa/cewolf;jsessionid=ABC?img=751359235"/></center>
</fieldset></div></body></html>
"""

CONTEXT = (
    "<script>var nomeTurma = \"<div style='padding:10px'>"
    'Turma: FGA0146 - ESTRUTURAS DE DADOS 1 (2026.2 - T01)</div>";</script>'
)


class FakeSession:
    """Só o suficiente para o ritual do menu: uma página no GET, outra no POST."""

    def __init__(self, page: str, result: str) -> None:
        self.page = page
        self.result = result
        self.payload: dict[str, str] = {}

    async def get(self, url: str, **_: object) -> httpx.Response:
        return httpx.Response(200, text=self.page)

    async def post(self, url: str, data: dict[str, str], **_: object) -> httpx.Response:
        self.payload = data
        return httpx.Response(200, text=self.result)


def test_frequencia_traz_aulas_totais_e_andamento():
    frequencia = _parse_frequency(BeautifulSoup(FREQUENCY, "lxml"))

    assert frequencia.progress == ClassroomProgress(taught=24, total=72, percentage=33)
    assert frequencia.frequency is not None
    aulas = frequencia.frequency.entries
    assert [aula.status for aula in aulas] == [
        AttendanceStatus.PRESENTE,
        AttendanceStatus.FALTA,
        AttendanceStatus.NAO_REGISTRADA,
    ]
    assert aulas[1].occurred_on == date(2026, 8, 20)
    assert (aulas[1].absences, aulas[0].absences) == (2, 0)
    assert (frequencia.frequency.attended, frequencia.frequency.registered) == (63, 65)
    assert frequencia.frequency.registered_percentage == 96
    assert (frequencia.frequency.total, frequencia.frequency.total_percentage) == (
        72,
        87,
    )


def test_frequencia_nao_lancada_vem_none_com_andamento():
    frequencia = _parse_frequency(BeautifulSoup(NOT_LAUNCHED, "lxml"))

    # Os totais dessa tela são fictícios (100% em tudo) e não podem vazar.
    assert frequencia.frequency is None
    assert frequencia.progress == ClassroomProgress(taught=10, total=32, percentage=31)


def test_situacao_desconhecida_e_barulhenta():
    pagina = FREQUENCY.replace("Presente", "Dispensado")

    with pytest.raises(SigaaParseError):
        _parse_frequency(BeautifulSoup(pagina, "lxml"))


def test_andamento_ausente_e_barulhento():
    pagina = FREQUENCY.replace("Andamento das Aulas", "Outro Bloco")

    with pytest.raises(SigaaParseError):
        _parse_frequency(BeautifulSoup(pagina, "lxml"))


async def test_frequencia_abre_pelo_postback_do_menu():
    session = FakeSession(CLASSROOM_HOME, FREQUENCY)

    pagina = await _open_frequency(session, True)  # type: ignore[arg-type]

    assert pagina == FREQUENCY
    assert session.payload == {
        "formMenu": "formMenu",
        "formMenu:j_id_jsp_97": "formMenu:j_id_jsp_97",
        "javax.faces.ViewState": "j_id6",
    }


class SharedSession:
    """Entra na turma pedida, mas a tela sai na turma em que outro uso da sessão a deixou."""

    history = HISTORY.replace(
        "<body>",
        '<body><form name="form"><input name="javax.faces.ViewState" value="j1"/>',
    ).replace("</body>", "</form></body>")

    def __init__(self, *screens: str) -> None:
        self.screens = list(screens)
        self.entries = 0

    async def get(self, url: str, **_: object) -> httpx.Response:
        if url == CLASSROOMS_PATH:
            return httpx.Response(200, text=self.history)
        return httpx.Response(200, text=self.screens.pop(0))

    async def post(self, url: str, **_: object) -> httpx.Response:
        self.entries += 1
        return httpx.Response(200, text="")


OTHER_CONTEXT = CONTEXT.replace(
    "FGA0146 - ESTRUTURAS DE DADOS 1 (2026.2 - T01)",
    "FGA0158 - ORIENTAÇÃO A OBJETOS (2025.2 - T02)",
)


async def test_turma_trocada_por_outro_uso_da_sessao_e_reaberta():
    session = SharedSession(PARTICIPANTS + OTHER_CONTEXT, PARTICIPANTS + CONTEXT)

    membros = await Classrooms(session).list_classroom_members("AAA")  # type: ignore[arg-type]

    assert len(membros) == 2
    assert session.entries == 2


async def test_turma_sempre_trocada_desiste_barulhenta():
    session = SharedSession(*[PARTICIPANTS + OTHER_CONTEXT] * 3)

    with pytest.raises(SigaaParseError):
        await Classrooms(session).list_classroom_members("AAA")  # type: ignore[arg-type]
    assert session.entries == 3


async def test_participantes_esperam_mais_que_o_timeout_padrao():
    timeouts: dict[str, float] = {}

    def sigaa(request: httpx.Request) -> httpx.Response:
        timeouts[request.url.path] = request.extensions["timeout"]["read"]
        if request.url.path == CLASSROOMS_PATH:
            return httpx.Response(200, text=SharedSession.history)
        if request.url.path == PARTICIPANTS_PATH:
            return httpx.Response(200, text=PARTICIPANTS + CONTEXT)
        return httpx.Response(200, text="")

    http = httpx.AsyncClient(
        base_url=SIGAA_BASE_URL, transport=httpx.MockTransport(sigaa), timeout=15
    )
    async with http:
        session = Session(http, session_token="token")
        membros = await Classrooms(session).list_classroom_members("AAA")

    assert len(membros) == 2
    # Turma com milhares de alunos demora mais que isso para o SIGAA responder.
    assert timeouts[PARTICIPANTS_PATH] == PARTICIPANTS_TIMEOUT
    assert timeouts[CLASSROOMS_PATH] == 15


def test_contexto_confere_codigo_numero_e_semestre():
    turma = _parse_history(HISTORY)["AAA"]

    _assert_context(CONTEXT, turma)

    with pytest.raises(SigaaParseError):
        _assert_context(CONTEXT.replace("T01", "T02"), turma)


def test_estatisticas_casam_a_legenda_com_as_situacoes():
    png = _render_legend(
        [
            "(56.8%)",
            "(33.3%)",
            "(0.0%)",
            "(0.0%)",
            "(0.0%)",
            "(0.0%)",
            "(0.0%)",
            "(9.9%)",
            "(0.0%)",
        ]
    )

    estatisticas = _parse_statistics(png)

    assert [fatia.situation for fatia in estatisticas[:2]] == [
        StudentSituation.APROVADO,
        StudentSituation.REPROVADO,
    ]
    assert estatisticas[7].situation == StudentSituation.TRANCADO
    assert (estatisticas[0].percentage, estatisticas[7].percentage) == (56.8, 9.9)
    assert estatisticas[-1].situation == StudentSituation.MATRICULADO


def test_legenda_com_outro_numero_de_situacoes_e_barulhenta():
    with pytest.raises(SigaaParseError):
        _parse_statistics(_render_legend(["(50.0%)", "(50.0%)"]))


def test_tela_de_estatisticas_sem_grafico_e_barulhenta():
    soup = BeautifulSoup('<html><div id="conteudo"></div></html>', "lxml")

    with pytest.raises(SigaaParseError):
        _chart_source(soup)


async def test_estatisticas_abre_pelo_postback_do_menu():
    session = FakeSession(CLASSROOM_HOME, STATISTICS_SCREEN)

    pagina = await _open_statistics(session, True)  # type: ignore[arg-type]

    assert _chart_source(BeautifulSoup(pagina, "lxml")).endswith("img=751359235")
    assert session.payload["formMenu:j_id_jsp_142"] == "formMenu:j_id_jsp_142"


_BULLET_COLORS = [
    (255, 85, 85),
    (85, 85, 255),
    (85, 255, 85),
    (255, 255, 85),
    (255, 85, 255),
    (85, 255, 255),
    (255, 175, 175),
    (128, 128, 128),
    (192, 0, 0),
]


def _render_legend(labels: Sequence[str], columns: int = 3, width: int = 650) -> bytes:
    """Uma legenda como a que o SIGAA desenha: quadradinho de cor + rótulo.

    O nome da situação vira um bloco preto — o leitor não lê o nome, e assim o
    teste cobre o glifo desconhecido que encerra a leitura.
    """
    lines = (len(labels) + columns - 1) // columns
    image = Image.new("RGB", (width, 25 * lines + 15), (255, 255, 255))
    pixels = image.load()
    assert pixels is not None

    for index, label in enumerate(labels):
        left = 6 + (index % columns) * (width // columns)
        baseline = 25 * (index // columns) + 20

        for x in range(left, left + 6):
            for y in range(baseline - 8, baseline - 1):
                pixels[x, y] = _BULLET_COLORS[index % len(_BULLET_COLORS)]

        cursor = left + 12
        for x in range(cursor, cursor + 5):
            for y in range(baseline - 9, baseline):
                pixels[x, y] = (0, 0, 0)
        cursor += 7

        for char in label:
            rows = _GLYPHS[char].split("/")
            for y, row in enumerate(rows):
                for x, cell in enumerate(row):
                    if cell == "#":
                        pixels[cursor + x, baseline - len(rows) + y] = (0, 0, 0)
            cursor += len(rows[0]) + 1

    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def test_le_as_porcentagens_na_ordem_da_legenda():
    png = _render_legend(["(56.8%)", "(33.3%)", "(0.0%)", "(9.9%)"])

    assert _legend_percentages(png) == (56.8, 33.3, 0.0, 9.9)


def test_le_item_que_ocupa_a_linha_inteira():
    png = _render_legend(["(100.0%)"], columns=1)

    assert _legend_percentages(png) == (100.0,)


def test_item_sem_porcentagem_e_barulhento():
    png = _render_legend(["(12.3%)", "(0.0%)"])
    image = Image.open(BytesIO(png)).convert("RGB")
    pixels = image.load()
    assert pixels is not None
    for x in range(30, 120):  # apaga o número do primeiro item
        for y in range(image.size[1]):
            pixels[x, y] = (255, 255, 255)
    buffer = BytesIO()
    image.save(buffer, format="PNG")

    with pytest.raises(SigaaParseError):
        _legend_percentages(buffer.getvalue())


def test_imagem_sem_legenda_e_barulhenta():
    buffer = BytesIO()
    Image.new("RGB", (650, 400), (192, 192, 192)).save(buffer, format="PNG")

    with pytest.raises(SigaaParseError):
        _legend_percentages(buffer.getvalue())


NEWS_LIST = """
<html><body><div id="conteudo">
<form id="j_id_jsp_297" name="j_id_jsp_297" action="/sigaa/ava/NoticiaTurma/listar.jsf">
<fieldset><legend>Notícias</legend>
<table class="listing">
<thead><tr><th><p align="left">Título</p></th><th>Data</th><th></th></tr></thead>
<tbody>
<tr class="even">
  <td class="first">Bem-vindos à disciplina</td>
  <td class="width75">10/08/2026</td>
  <td class="icon"><a href="#" onclick="if(typeof jsfcljs == 'function'){jsfcljs(document.getElementById('j_id_jsp_297'),{'j_id_jsp_297:j_id_jsp_300':'j_id_jsp_297:j_id_jsp_300','id':'23433316'},'');}return false"><img title="Visualizar"/></a></td>
</tr>
</tbody>
</table>
</fieldset>
<input type="hidden" name="javax.faces.ViewState" value="j_id3"/>
</form>
</div></body></html>
"""

NEWS_EMPTY = """
<html><body><div id="conteudo"><form id="f">
<fieldset><legend>Notícias</legend></fieldset>
</form></div></body></html>
"""

NEWS_DETAIL = """
<html><body><div id="conteudo">
<form id="j_id_jsp_297" action="/sigaa/ava/NoticiaTurma/mostrar.jsf">
<fieldset>
  <legend>Visualização de Notícia</legend>
<ul class="form">
  <li><label>Título:</label><span> Bem-vindos à disciplina </span></li>
  <li><label>Data:</label><span> 10/08/2026 15:24 </span></li>
  <li><table><tbody><tr><th>Texto:</th><td class="conteudoNoticia">
    <div style="padding-left:20px;"><p>Prezados(as) estudantes,</p></div>
  </td></tr></tbody></table></li>
  <li><label>Anexo:</label><span>
    <a href="/sigaa/verArquivo?idArquivo=4068560&amp;key=abc" target="_blank"> Plano.pdf </a>
  </span></li>
</ul>
</fieldset>
</form>
</div></body></html>
"""


def test_listagem_de_noticias_traz_id_titulo_e_dia():
    noticias = _parse_news_list(BeautifulSoup(NEWS_LIST, "lxml"))

    assert [(n.id, n.title, n.published_on) for n in noticias] == [
        (23433316, "Bem-vindos à disciplina", date(2026, 8, 10))
    ]


def test_turma_sem_noticias_devolve_lista_vazia():
    assert _parse_news_list(BeautifulSoup(NEWS_EMPTY, "lxml")) == []


def test_legenda_da_noticia_e_comparada_como_texto():
    soup = BeautifulSoup(
        "<fieldset><legend> Notícias (Turma)? </legend></fieldset>", "lxml"
    )

    assert _news_fieldset(soup, "Notícias (Turma)?") is not None


def test_tela_sem_listagem_de_noticias_e_barulhenta():
    with pytest.raises(SigaaParseError):
        _parse_news_list(BeautifulSoup("<html><body></body></html>", "lxml"))


def test_visualizacao_traz_hora_texto_e_anexo():
    noticia = _parse_news_detail(BeautifulSoup(NEWS_DETAIL, "lxml"), 23433316)

    assert noticia.title == "Bem-vindos à disciplina"
    assert noticia.published_at == datetime(2026, 8, 10, 15, 24)  # noqa: DTZ001
    assert noticia.published_on == date(2026, 8, 10)
    assert noticia.content == "Prezados(as) estudantes,"
    assert [(a.name, a.url) for a in noticia.attachments] == [
        ("Plano.pdf", f"{SIGAA_BASE_URL}/sigaa/verArquivo?idArquivo=4068560&key=abc")
    ]


class NewsSession:
    """O menu da turma no GET; depois, uma resposta por postback, na ordem."""

    def __init__(self, *results: str) -> None:
        self.results = list(results)
        self.payloads: list[dict[str, str]] = []

    async def get(self, url: str, **_: object) -> httpx.Response:
        return httpx.Response(200, text=CLASSROOM_HOME)

    async def post(self, url: str, data: dict[str, str], **_: object) -> httpx.Response:
        self.payloads.append(data)
        return httpx.Response(200, text=self.results.pop(0))


async def test_noticia_abre_pelo_menu_e_pelo_link_da_listagem():
    session = NewsSession(NEWS_LIST, NEWS_DETAIL)

    pagina = await _open_news_detail(23433316, session, True)  # type: ignore[arg-type]

    assert pagina == NEWS_DETAIL
    assert session.payloads[0]["formMenu:j_id_jsp_88"] == "formMenu:j_id_jsp_88"
    assert session.payloads[1] == {
        "j_id_jsp_297": "j_id_jsp_297",
        "j_id_jsp_297:j_id_jsp_300": "j_id_jsp_297:j_id_jsp_300",
        "id": "23433316",
        "javax.faces.ViewState": "j_id3",
    }


async def test_noticia_que_nao_esta_na_turma_e_barulhenta():
    session = NewsSession(NEWS_LIST)

    pagina = await _open_news_detail(1, session, True)  # type: ignore[arg-type]

    assert len(session.payloads) == 1
    with pytest.raises(NewsNotFound):
        _parse_news_detail(BeautifulSoup(pagina, "lxml"), 1)


@pytest.mark.parametrize("page", ["<html>layout inesperado</html>", NEWS_LIST])
def test_detalhe_ilegivel_nao_e_confundido_com_noticia_ausente(page):
    with pytest.raises(SigaaParseError):
        _parse_news_detail(BeautifulSoup(page, "lxml"), 23433316)
