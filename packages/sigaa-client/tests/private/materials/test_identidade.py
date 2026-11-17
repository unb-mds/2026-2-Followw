import asyncio

import pytest

from sigaa_client import (
    ClassroomNotFound,
    MaterialNotFound,
    SigaaClient,
    SigaaParseError,
)

from ...fakes import CREDENTIALS
from .fakes import MATERIAL_IDS, POSTS, MaterialSigaa


async def test_post_usa_comando_atual_e_viewstate_do_form_ava():
    fake = MaterialSigaa()
    async with SigaaClient(CREDENTIALS, transport=fake.transport) as client:
        for state in (1, 2):
            file = await client.classrooms.download_classroom_material(
                "AAA", MATERIAL_IDS[0]
            )
            assert file.content == b"first"
            assert file.filename == "Notas.pdf"
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
            *(
                client.classrooms.download_classroom_material("AAA", material_id)
                for material_id in MATERIAL_IDS
            )
        )
    assert [file.content for file in files] == [b"first", b"second", b"third"]
    assert [file.filename for file in files] == ["Notas.pdf"] * 3


@pytest.mark.parametrize(
    "material_id", ["material:" + "f" * 64, POSTS[0].id, POSTS[3].id]
)
async def test_arquivo_ausente_ou_link_externo_nao_faz_download(material_id):
    fake = MaterialSigaa()
    async with SigaaClient(CREDENTIALS, transport=fake.transport) as client:
        with pytest.raises(MaterialNotFound):
            await client.classrooms.download_classroom_material("AAA", material_id)
    assert fake.downloads == []


async def test_turma_sem_acesso_nao_submete_download():
    fake = MaterialSigaa()
    async with SigaaClient(CREDENTIALS, transport=fake.transport) as client:
        with pytest.raises(ClassroomNotFound):
            await client.classrooms.download_classroom_material(
                "OUTRA", MATERIAL_IDS[0]
            )
    assert fake.downloads == []


async def test_contexto_de_outra_turma_nao_submete_download():
    fake = MaterialSigaa()
    fake.switch_context = True
    async with SigaaClient(CREDENTIALS, transport=fake.transport) as client:
        with pytest.raises(SigaaParseError):
            await client.classrooms.download_classroom_material("AAA", MATERIAL_IDS[0])
    assert fake.downloads == []
    assert fake.entries == 3


async def test_renovacao_reabre_turma_e_refaz_post_com_estado_novo():
    fake = MaterialSigaa()
    fake.expire_download = True
    async with SigaaClient(CREDENTIALS, transport=fake.transport) as client:
        file = await client.classrooms.download_classroom_material(
            "AAA", MATERIAL_IDS[0]
        )
    assert file.content == b"first"
    assert fake.logins == 2
    assert fake.entries == 2
    assert fake.downloads[0]["javax.faces.ViewState"] == "topics-1"
    assert fake.downloads[1]["javax.faces.ViewState"] == "topics-2"
    assert "formAva:2:first" in fake.downloads[1]


async def test_material_sem_identificador_nao_impede_download_do_arquivo_valido(
    monkeypatch,
):
    from . import fakes

    original = fakes.topics
    monkeypatch.setattr(
        fakes,
        "topics",
        lambda state: original(state).replace(
            '<div class="item">',
            '<div class="item"><a href="#">Outro</a></div><div class="item">',
            1,
        ),
    )
    fake = MaterialSigaa()
    async with SigaaClient(CREDENTIALS, transport=fake.transport) as client:
        file = await client.classrooms.download_classroom_material(
            "AAA", MATERIAL_IDS[0]
        )
    assert file.content == b"first"
