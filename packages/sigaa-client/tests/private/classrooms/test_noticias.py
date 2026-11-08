from datetime import date, datetime

import pytest
from bs4 import BeautifulSoup

from sigaa_client import NewsNotFound
from sigaa_client.config import SIGAA_BASE_URL
from sigaa_client.exceptions import SigaaParseError
from sigaa_client.private.classrooms import (
    _news_fieldset,
    _open_news_detail,
    _parse_news_detail,
    _parse_news_list,
)

from ...fakes import NewsSession

CLASSROOM_HOME = """
<html><body>
<form id="formMenu" name="formMenu" action="/sigaa/ava/index.jsf">
  <a href="#" onclick="jsfcljs(document.getElementById('formMenu'),
    {'formMenu:j_id_jsp_88':'formMenu:j_id_jsp_88'},'');">
    <div class="itemMenu">Notícias</div></a>
  <input name="javax.faces.ViewState" type="hidden" value="j_id6"/>
</form>
</body></html>
"""

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
    assert noticia.published_at == datetime(2026, 8, 10, 15, 24)
    assert noticia.published_on == date(2026, 8, 10)
    assert noticia.content == "Prezados(as) estudantes,"
    assert [(a.name, a.url) for a in noticia.attachments] == [
        ("Plano.pdf", f"{SIGAA_BASE_URL}/sigaa/verArquivo?idArquivo=4068560&key=abc")
    ]


async def test_noticia_abre_pelo_menu_e_pelo_link_da_listagem():
    session = NewsSession(NEWS_LIST, NEWS_DETAIL, home=CLASSROOM_HOME)

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
    session = NewsSession(NEWS_LIST, home=CLASSROOM_HOME)

    pagina = await _open_news_detail(1, session, True)  # type: ignore[arg-type]

    assert len(session.payloads) == 1
    with pytest.raises(NewsNotFound):
        _parse_news_detail(BeautifulSoup(pagina, "lxml"), 1)


@pytest.mark.parametrize("page", ["<html>layout inesperado</html>", NEWS_LIST])
def test_detalhe_ilegivel_nao_e_confundido_com_noticia_ausente(page):
    with pytest.raises(SigaaParseError):
        _parse_news_detail(BeautifulSoup(page, "lxml"), 23433316)
