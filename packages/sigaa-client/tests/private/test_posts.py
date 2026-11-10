from datetime import date, datetime
from unittest.mock import AsyncMock

import httpx
import pytest
from bs4 import BeautifulSoup

from sigaa_client import (
    ClassroomPost,
    DashboardPost,
    News,
    PostType,
    SigaaParseError,
)
from sigaa_client.private.classrooms import Classrooms, _open_topics
from sigaa_client.private.posts import _parse_assessments, _parse_topics

TOPICS = """
<form id="formAva">
  <div id="ultimaNoticia"><h4>Última Notícia</h4><p>Não duplicar.</p></div>
  <div class="topico-aula" id="formAva:lista:0:topico_aula">
    <div class="titulo">Sistemas de Numeração (24/03/2025 - 26/03/2025)</div>
    <div class="conteudotopico">
      <p>Leia o <strong>capítulo 1</strong>.</p>
      <div class="drag_indicator"><script>codigo_interno()</script></div>
      <div class="item">
        <a href="#" onclick="jsfcljs(f,{'f:download':'f:download','id':'ABC123'},'_blank')">Plano.pdf</a>
        <div class="descricao-item">Plano da disciplina</div>
      </div>
      <div class="item"><a href="https://example.org/aula">Referência</a></div>
    </div>
  </div>
  <div class="topico-aula" id="formAva:lista:1:topico_aula">
    <div class="titulo">PROVA 1 (28/03/2025 - 28/03/2025)</div>
    <div class="conteudotopico"><div class="item">
      <a href="#" onclick="jsfcljs(f,{'id':'ABC123'},'_blank')">Plano.pdf</a>
    </div></div>
  </div>
</form>
"""
ASSESSMENTS = """
<fieldset><legend>Datas de Avaliações</legend><table class="listing"><tbody>
<tr><td>29/10/2026</td><td>16:00</td><td>Avaliação A2</td><td>
<a href="#" onclick="jsfcljs(f,{'id':'22089705'},'')">Visualizar</a>
</td></tr>
<tr><td>30/10/2026</td><td>Hora da aula</td><td>Prova 3</td><td>
<a href="#" onclick="jsfcljs(f,{'id':'22089706'},'')">Visualizar</a>
</td></tr>
</tbody></table></fieldset>
"""


def test_topicos_e_materiais_sao_posts_distintos_com_vinculo():
    topic, file, reference, second_topic, second_file = _parse_topics(
        BeautifulSoup(TOPICS, "lxml")
    )
    assert topic.type == PostType.TOPIC
    assert topic.title == "Sistemas de Numeração"
    assert topic.starts_on == date(2025, 3, 24)
    assert topic.ends_on == date(2025, 3, 26)
    assert topic.content == "Leia o **capítulo 1**."
    assert topic.published_on is None
    assert file.type == PostType.MATERIAL
    assert file.topic_id == topic.id
    assert file.title == "Plano.pdf"
    assert file.content == "Plano da disciplina"
    assert file.sigaa_id == "ABC123"
    assert file.url is None
    assert reference.url == "https://example.org/aula"
    assert second_topic.type == PostType.TOPIC
    assert second_file.topic_id == second_topic.id
    assert second_file.id != file.id


def test_ids_nao_dependem_dos_indices_gerados_pelo_jsf():
    original = _parse_topics(BeautifulSoup(TOPICS, "lxml"))
    reordered = _parse_topics(
        BeautifulSoup(TOPICS.replace("lista:0", "outro:99"), "lxml")
    )
    assert [post.id for post in original] == [post.id for post in reordered]


def test_agenda_preserva_horario_sem_inventar_hora_nem_data_publicacao():
    first, second = _parse_assessments(BeautifulSoup(ASSESSMENTS, "lxml"))
    assert first.id == "assessment:22089705"
    assert first.type == PostType.ASSESSMENT
    assert first.starts_on == date(2026, 10, 29)
    assert first.starts_at == datetime(2026, 10, 29, 16)
    assert first.published_on is None
    assert first.topic_id is None
    assert second.starts_at is None
    assert second.time_label == "Hora da aula"
    assert "grade" not in first.model_dump()


def test_turma_sem_topicos_e_agenda_vazia():
    assert (
        _parse_topics(
            BeautifulSoup(
                '<form id="formAva">O professor não criou nenhum tópico de aula.</form>',
                "lxml",
            )
        )
        == []
    )
    assert (
        _parse_assessments(
            BeautifulSoup(
                "<fieldset><legend>Datas de Avaliações</legend></fieldset>", "lxml"
            )
        )
        == []
    )


@pytest.mark.parametrize(
    "html",
    [
        "",
        TOPICS.replace("24/03/2025", "data inválida"),
        TOPICS.replace("'id':'ABC123'", "'outro':'ABC123'"),
    ],
)
def test_topico_ou_material_ilegivel_nao_vira_lista_vazia(html):
    with pytest.raises(SigaaParseError):
        _parse_topics(BeautifulSoup(html, "lxml"))


@pytest.mark.parametrize(
    "html",
    [
        "",
        ASSESSMENTS.replace("'id':", "'outro':"),
        ASSESSMENTS.replace("29/10/2026", "amanhã"),
    ],
)
def test_avaliacao_ilegivel_e_barulhenta(html):
    with pytest.raises(SigaaParseError):
        _parse_assessments(BeautifulSoup(html, "lxml"))


async def test_principal_paginada_e_aberta_em_lista_por_postback_com_viewstate_novo():
    menu = """<form id="formMenu" action="/sigaa/ava/index.jsf">
    <a onclick="jsfcljs(f,{'principal':'principal'},'')">Principal</a>
    <input name="javax.faces.ViewState" value="primeiro"></form>"""
    paginated = """<form id="formAcoesTurma" action="/sigaa/ava/index.jsf">
    <button id="formAcoesTurma:visualizarAulasEmLista"></button>
    <a id="formAcoesTurma:linkExibirEmLista" onclick="jsfcljs(f,{'formAcoesTurma:linkExibirEmLista':'formAcoesTurma:linkExibirEmLista'},'')"></a>
    <input name="javax.faces.ViewState" value="segundo"></form>"""
    session = AsyncMock()
    session.get.return_value = httpx.Response(200, text=menu)
    session.post.side_effect = [
        httpx.Response(200, text=paginated),
        httpx.Response(200, text=TOPICS),
    ]
    assert await _open_topics(session, True) == TOPICS
    payload = session.post.call_args_list[1].kwargs["data"]
    assert payload["javax.faces.ViewState"] == "segundo"
    assert "formAcoesTurma:linkExibirEmLista" in payload
    assert "formAcoesTurma:visualizarAulasEmLista" not in payload


async def test_listagem_unificada_usa_leitura_com_contexto_para_cada_tela():
    resource = Classrooms(AsyncMock())
    resource._read_screen = AsyncMock(side_effect=[TOPICS, ASSESSMENTS])
    resource.list_classroom_news = AsyncMock(
        return_value=[News(id=1, title="Aviso", published_on=date(2026, 10, 15))]
    )
    posts = await resource.list_classroom_posts("AAA")
    assert {post.type for post in posts} == set(PostType)
    assert [call.args[0] for call in resource._read_screen.call_args_list] == [
        "AAA",
        "AAA",
    ]
    resource.list_classroom_news.assert_awaited_once_with("AAA")
    assert posts[-1] == ClassroomPost.from_news(
        resource.list_classroom_news.return_value[0]
    )


HOME = """
<html><body>
<div id="turmas-portal"><table><tbody>
  <tr><td colspan="5">2026.2</td></tr>
  <tr class="odd"><td class="descricao">
    <form id="form_acessarTurmaVirtualj_id_1">
      <a href="#" onclick="jsfcljs(x,{'frontEndIdTurma':'AAA'},'');">MATEM&Aacute;TICA DISCRETA 2</a>
    </form>
  </td><td class="info">FCTE - S1</td><td class="info"><center>35M34</center></td><td></td></tr>
  <tr><td colspan="5" id="linha_1615025" style="display: none;"></td></tr>
</tbody></table></div>
<div id="atualizacoes-turma"><div class="rotator">
  <table>
    <tr><td>
      07/10/2026 -
      <a href="#" onclick="jsfcljs(x,{'formAtualizacoesTurmas:j_id':'formAtualizacoesTurmas:j_id','idTurma':'1615025'},'');">MATEM&Aacute;TICA DISCRETA 2 (2026.2)</a>
    </td></tr>
    <tr><td>Nova Not&#237;cia: Planilha de Notas MD2 - 2026.2</td></tr>
  </table>
  <table>
    <tr><td>
      15/07/2026 -
      <a href="#" onclick="jsfcljs(x,{'idTurma':'1615025'},'');">MATEM&Aacute;TICA DISCRETA 2 (2026.2)</a>
    </td></tr>
    <tr><td>Avalia&#231;&#227;o marcada para o dia 21/05/2026</td></tr>
  </table>
</div></div>
<div id="avaliacao-portal" class="simple-panel">
  <h4> Minhas atividades  </h4>
  <table>
    <thead><tr><th></th><th>Data</th><th>Atividade</th></tr></thead>
    <tbody>
      <tr><td colspan="5">2026.2</td></tr>
      <tr class="odd">
        <td><img src='/sigaa/img/prova_mes.png'></td>
        <td>29/10/2026 (14 dias)</td>
        <td><small>MATEM&#193;TICA DISCRETA 2<br> <strong>Avalia&#231;&#227;o:</strong> Avalia&#231;&#227;o A2</small></td>
      </tr>
      <tr>
        <td><img src='/sigaa/img/prova_mes.png'></td>
        <td>30/10/2026 (15 dias)</td>
        <td><small>C&#193;LCULO 1<br> <strong>Avalia&#231;&#227;o:</strong> Prova 2</small></td>
      </tr>
      <tr>
        <td><img src='/sigaa/img/tarefa.png'></td>
        <td>31/10/2026 (16 dias)</td>
        <td><small>MATEM&#193;TICA DISCRETA 2<br> <strong>Tarefa:</strong> Lista 3</small></td>
      </tr>
    </tbody>
  </table>
</div>
</body></html>
"""


async def _dashboard_posts(page: str) -> list[DashboardPost]:
    session = AsyncMock()
    session.get.return_value = httpx.Response(200, text=page)
    return await Classrooms(session).list_dashboard_posts()


async def test_home_reune_noticias_e_avaliacoes_das_turmas():
    assert await _dashboard_posts(HOME) == [
        DashboardPost(
            type=PostType.NEWS,
            classroom_sigaa_id=1615025,
            title="Planilha de Notas MD2 - 2026.2",
            published_on=date(2026, 10, 7),
        ),
        DashboardPost(
            type=PostType.ASSESSMENT,
            classroom_sigaa_id=1615025,
            title="Avaliação A2",
            starts_on=date(2026, 10, 29),
        ),
        # Disciplina fora das turmas do portal fica sem turma.
        DashboardPost(
            type=PostType.ASSESSMENT,
            title="Prova 2",
            starts_on=date(2026, 10, 30),
        ),
    ]


async def test_home_sem_paineis_nao_tem_posts():
    assert await _dashboard_posts("<html><body></body></html>") == []


@pytest.mark.parametrize(
    "broken",
    [
        HOME.replace("'idTurma':'1615025'", "", 1),
        HOME.replace("29/10/2026 (14 dias)", "(14 dias)"),
        HOME.replace(
            "<strong>Avalia&#231;&#227;o:</strong> Avalia&#231;&#227;o A2",
            "Avaliação A2",
        ),
    ],
)
async def test_post_da_home_fora_do_formato_e_barulhento(broken):
    with pytest.raises(SigaaParseError):
        await _dashboard_posts(broken)
