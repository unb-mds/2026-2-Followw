import pytest
from bs4 import BeautifulSoup

from sigaa_client import MaterialNotFound, SigaaClient
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


def test_item_com_acao_propria_vira_link_para_o_sigaa(com_tarefa):
    _, task, file, *_ = _parse_topics(BeautifulSoup(fakes.topics(1), "lxml"))
    assert task.url == "https://sigaa.unb.br/sigaa/ava/index.jsf"
    assert task.sigaa_id == "101"
    assert file.url is None


async def test_item_com_acao_propria_nao_dispara_postback(com_tarefa):
    task = _parse_topics(BeautifulSoup(fakes.topics(1), "lxml"))[1]
    fake = MaterialSigaa()
    async with SigaaClient(CREDENTIALS, transport=fake.transport) as client:
        with pytest.raises(MaterialNotFound):
            await read_material(client, task.id)
    assert fake.downloads == []
