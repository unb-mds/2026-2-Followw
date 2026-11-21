from bs4 import BeautifulSoup

from sigaa_client import SigaaClient
from sigaa_client.private.posts import _parse_topics

from ...fakes import CREDENTIALS
from . import fakes
from .fakes import MaterialSigaa, read_material


def _com_item_repetido(monkeypatch):
    original = fakes.topics
    monkeypatch.setattr(
        fakes,
        "topics",
        lambda state: original(state).replace(
            '<div class="item"><a href="https://example.org">',
            f"""<div class="item"><a href="#" onclick="jsfcljs(f,{{'formAva:{state}:copy':'formAva:{state}:copy','id':'101'}},'')">Notas.pdf</a></div>
            <div class="item"><a href="https://example.org">""",
            1,
        ),
    )


def test_mesmo_item_repetido_no_topico_tem_ids_distintos(monkeypatch):
    _com_item_repetido(monkeypatch)
    posts = _parse_topics(BeautifulSoup(fakes.topics(1), "lxml"))
    ids = [post.id for post in posts]
    assert len(ids) == len(set(ids))
    assert posts[1].sigaa_id == posts[3].sigaa_id == "101"


async def test_item_repetido_baixa_o_arquivo_de_cada_ocorrencia(monkeypatch):
    _com_item_repetido(monkeypatch)
    first, copy = _parse_topics(BeautifulSoup(fakes.topics(1), "lxml"))[1:4:2]
    fake = MaterialSigaa()
    async with SigaaClient(CREDENTIALS, transport=fake.transport) as client:
        assert (await read_material(client, first.id))[0] == b"first"
        assert (await read_material(client, copy.id))[0] == b"copy"
