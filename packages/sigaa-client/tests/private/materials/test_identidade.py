import asyncio

import pytest
from bs4 import BeautifulSoup

from sigaa_client import (
    ClassroomNotFound,
    MaterialNotFound,
    SigaaClient,
    SigaaParseError,
)
from sigaa_client.private.posts import _parse_topics

from ...fakes import CREDENTIALS
from . import fakes
from .fakes import MATERIAL_IDS, POSTS, MaterialSigaa, read_material


async def test_post_usa_comando_atual_e_viewstate_do_form_ava():
    fake = MaterialSigaa()
    async with SigaaClient(CREDENTIALS, transport=fake.transport) as client:
        for state in (1, 2):
            content, filename, _ = await read_material(client, MATERIAL_IDS[0])
            assert content == b"first"
            assert filename == "Notas.pdf"
            assert fake.downloads[-1] == {
                "formAva": "formAva",
                f"formAva:{state}:first": f"formAva:{state}:first",
                "id": "101",
                "javax.faces.ViewState": f"topics-{state}",
            }


async def test_arquivos_homonimos_usam_id_e_topico_corretos():
    fake = MaterialSigaa()
    async with SigaaClient(CREDENTIALS, transport=fake.transport) as client:
        files = await asyncio.gather(
            *(read_material(client, material_id) for material_id in MATERIAL_IDS)
        )
    assert [content for content, _, _ in files] == [b"first", b"second", b"third"]
    assert [filename for _, filename, _ in files] == ["Notas.pdf"] * 3


async def test_anexo_listado_com_href_javascript_usa_o_postback(monkeypatch):
    original = fakes.topics
    monkeypatch.setattr(
        fakes,
        "topics",
        lambda state: original(state).replace(
            'href="#"', 'href="javascript:void(0)"', 1
        ),
    )
    material = _parse_topics(BeautifulSoup(fakes.topics(1), "lxml"))[1]
    assert material.url is None

    fake = MaterialSigaa()
    async with SigaaClient(CREDENTIALS, transport=fake.transport) as client:
        content, _, _ = await read_material(client, material.id)
    assert content == b"first"
    assert fake.downloads[0]["id"] == "101"


@pytest.mark.parametrize(
    "material_id", ["material:" + "f" * 64, POSTS[0].id, POSTS[3].id]
)
async def test_arquivo_ausente_ou_link_externo_nao_faz_download(material_id):
    fake = MaterialSigaa()
    async with SigaaClient(CREDENTIALS, transport=fake.transport) as client:
        with pytest.raises(MaterialNotFound):
            await read_material(client, material_id)
    assert fake.downloads == []


async def test_turma_sem_acesso_nao_submete_download():
    fake = MaterialSigaa()
    async with SigaaClient(CREDENTIALS, transport=fake.transport) as client:
        with pytest.raises(ClassroomNotFound):
            await read_material(client, MATERIAL_IDS[0], "OUTRA")
    assert fake.downloads == []


async def test_contexto_de_outra_turma_nao_submete_download():
    fake = MaterialSigaa()
    fake.switch_context = True
    async with SigaaClient(CREDENTIALS, transport=fake.transport) as client:
        with pytest.raises(SigaaParseError):
            await read_material(client, MATERIAL_IDS[0])
    assert fake.downloads == []
    assert fake.entries == 3


async def test_renovacao_reabre_turma_e_refaz_post_com_estado_novo():
    fake = MaterialSigaa()
    fake.expire_download = True
    async with SigaaClient(CREDENTIALS, transport=fake.transport) as client:
        content, _, _ = await read_material(client, MATERIAL_IDS[0])
    assert content == b"first"
    assert fake.logins == 2
    assert fake.entries == 2
    assert fake.downloads[0]["javax.faces.ViewState"] == "topics-1"
    assert fake.downloads[1]["javax.faces.ViewState"] == "topics-2"
    assert "formAva:2:first" in fake.downloads[1]


@pytest.mark.parametrize("href", ["#", "https://["])
async def test_material_sem_identificador_nao_impede_download_do_arquivo_valido(
    monkeypatch, href
):
    original = fakes.topics
    monkeypatch.setattr(
        fakes,
        "topics",
        lambda state: original(state).replace(
            '<div class="item">',
            f'<div class="item"><a href="{href}">Outro</a></div><div class="item">',
            1,
        ),
    )
    fake = MaterialSigaa()
    async with SigaaClient(CREDENTIALS, transport=fake.transport) as client:
        content, _, _ = await read_material(client, MATERIAL_IDS[0])
    assert content == b"first"
