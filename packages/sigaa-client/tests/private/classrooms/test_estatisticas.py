from collections.abc import Sequence
from io import BytesIO

import pytest
from bs4 import BeautifulSoup
from PIL import Image

from sigaa_client import StudentSituation
from sigaa_client.exceptions import SigaaParseError
from sigaa_client.private.classrooms import (
    _GLYPHS,
    _chart_source,
    _legend_percentages,
    _open_statistics,
    _parse_statistics,
)

from ...fakes import FakeSession

CLASSROOM_HOME = """
<html><body>
<form id="formMenu" name="formMenu" action="/sigaa/ava/index.jsf">
  <a href="#" onclick="jsfcljs(document.getElementById('formMenu'),
    {'formMenu:j_id_jsp_142':'formMenu:j_id_jsp_142'},'');">Situação dos Discentes</a>
  <input name="javax.faces.ViewState" type="hidden" value="j_id6"/>
</form>
</body></html>
"""

STATISTICS_SCREEN = """
<html><body><div id="conteudo"><fieldset><legend>Estatísticas da Turma</legend>
<center><img alt="" src="/sigaa/cewolf;jsessionid=ABC?img=751359235"/></center>
</fieldset></div></body></html>
"""

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
