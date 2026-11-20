import pytest
from bs4 import BeautifulSoup

from sigaa_client import MaterialKind, MaterialNotFound, SigaaClient
from sigaa_client.private.posts import _parse_topics

from ...fakes import CREDENTIALS
from . import fakes
from .fakes import MaterialSigaa, read_material


@pytest.fixture
def com_tarefa(monkeypatch):
    original = fakes.topics
    monkeypatch.setattr(
        fakes,
        "topics",
        lambda state: original(state).replace(
            '<a href="#"', '<a id="formAva:1:enviarTarefa" href="#"', 1
        ),
    )


def test_item_com_acao_propria_e_marcado_como_acao(com_tarefa):
    _, task, file, link, *_ = _parse_topics(BeautifulSoup(fakes.topics(1), "lxml"))
    assert (task.material_kind, task.url, task.sigaa_id) == (
        MaterialKind.ACTION,
        None,
        "101",
    )
    assert (file.material_kind, file.url) == (MaterialKind.FILE, None)
    assert (link.material_kind, link.url) == (
        MaterialKind.LINK,
        "https://example.org",
    )


async def test_item_com_acao_propria_nao_dispara_postback(com_tarefa):
    task = _parse_topics(BeautifulSoup(fakes.topics(1), "lxml"))[1]
    fake = MaterialSigaa()
    async with SigaaClient(CREDENTIALS, transport=fake.transport) as client:
        with pytest.raises(MaterialNotFound):
            await read_material(client, task.id)
    assert fake.downloads == []
