import json
from datetime import datetime

import pytest
from bs4 import BeautifulSoup

from sigaa_client.config import SIGAA_BASE_URL
from sigaa_client.exceptions import SigaaParseError
from sigaa_client.utils.parsing import parse_datetime, to_markdown


def _markdown(html: str) -> str | None:
    node = BeautifulSoup(f"<div>{html}</div>", "lxml").div
    assert node is not None
    return to_markdown(node)


def test_markdown_mantem_paragrafos_negrito_e_listas():
    html = """
    <p style="text-align: justify;">Prezados(as) <strong>estudantes</strong>,</p>
    <ul><li>um</li><li>dois</li></ul>
    <p>Prof. Fulano<br>Universidade de Brasília</p>
    """

    assert _markdown(html) == (
        "Prezados(as) **estudantes**,\n\n- um\n- dois\n\n"
        "Prof. Fulano\\\nUniversidade de Brasília"
    )


def test_markdown_descarta_paragrafos_vazios_e_quebras_soltas():
    html = """
    <p><br>Link abaixo</p>
    <p>Sala: <b>T01</b><br><br></p>
    <p>&nbsp;</p><p>&nbsp;</p>
    """

    assert _markdown(html) == "Link abaixo\n\nSala: **T01**"


def test_markdown_deixa_links_absolutos_e_sem_titulo():
    html = """
    <p><a href="/sigaa/verArquivo?idArquivo=1" title="anexo">Plano</a></p>
    <p><a href="https://chat.whatsapp.com/abc" title="Grupo">https://chat.whatsapp.com/abc</a></p>
    """

    assert _markdown(html) == (
        f"[Plano]({SIGAA_BASE_URL}/sigaa/verArquivo?idArquivo=1)\n\n"
        "<https://chat.whatsapp.com/abc>"
    )


def test_markdown_de_html_vazio_e_none():
    assert _markdown("<p>&nbsp;</p><br>") is None


def test_quebra_markdown_nao_duplica_barras_ao_serializar_json():
    content = _markdown(
        "<p>🎥 <b>Filme:</b> Exemplo<br>📅 <b>Data:</b> 15/10<br>📍 Local: FCTE</p>"
    )
    assert content == "🎥 **Filme:** Exemplo\\\n📅 **Data:** 15/10\\\n📍 Local: FCTE"
    decoded = json.loads(json.dumps({"content": content}))
    assert decoded["content"] == content
    assert "\\\\" not in decoded["content"]


def test_markdown_nao_gera_link_nem_imagem_executavel():
    html = (
        '<p><a href="javascript:alert(1)">aqui</a> <a href=" JavaScript:x">ali</a> '
        '<a href="mailto:prof@unb.br">e-mail</a><img alt="x" src="data:text/html,oi"></p>'
    )

    assert _markdown(html) == "aqui ali [e-mail](mailto:prof@unb.br)"


def test_parse_datetime_le_data_do_sigaa():
    assert parse_datetime("10/08/2026 15:24", "%d/%m/%Y %H:%M", "da notícia") == (
        datetime(2026, 8, 10, 15, 24)  # noqa: DTZ001
    )


def test_parse_datetime_invalido_e_barulhento():
    with pytest.raises(SigaaParseError, match="do extrato do RU"):
        parse_datetime("ontem", "%d/%m/%Y %H:%M", "do extrato do RU")
