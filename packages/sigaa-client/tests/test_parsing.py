from bs4 import BeautifulSoup

from sigaa_client.config import SIGAA_BASE_URL
from sigaa_client.utils.parsing import to_markdown


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
