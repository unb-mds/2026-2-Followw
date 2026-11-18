import httpx
import pytest

from sigaa_client import SigaaClient, SigaaParseError

from ...fakes import CREDENTIALS
from .fakes import MATERIAL_IDS, MaterialSigaa, read_material


@pytest.mark.parametrize("redirect", [False, True])
@pytest.mark.parametrize(
    "content_type,content,name",
    [
        ("application/pdf", b"%PDF-1.7 real", "Notas.pdf"),
        ("text/plain; charset=utf-8", b"texto", "Notas.txt"),
        ("application/zip", b"PK\x03\x04bytes", "Notas.zip"),
        ("image/png", b"\x89PNG\r\n", "Notas.png"),
        ("text/html", b'<html><input type="password"></html>', "Exercicio.html"),
        ("application/json", b'{"aula": 1}', "Exercicio.json"),
    ],
)
async def test_preserva_bytes_tipo_e_nome_em_download_direto_ou_redirecionado(
    redirect, content_type, content, name
):
    fake = MaterialSigaa()
    fake.file = httpx.Response(
        200,
        content=content,
        headers={
            "content-type": content_type,
            "content-disposition": f'attachment; filename="{name}"',
        },
    )
    fake.initial = (
        httpx.Response(
            301,
            headers={
                "location": "https://arquivos.unb.br/material",
                "content-disposition": f'attachment; filename="{name}"',
            },
        )
        if redirect
        else fake.file
    )
    async with SigaaClient(CREDENTIALS, transport=fake.transport) as client:
        file = await read_material(client, MATERIAL_IDS[0])
    assert file == (content, name, content_type)
    for request in fake.requests:
        if request.url.host == "arquivos.unb.br":
            assert request.method == "GET"
            assert "JSESSIONID" not in request.headers.get("cookie", "")


async def test_nome_utf8_original_vem_do_cabecalho():
    fake = MaterialSigaa()
    fake.file.headers["content-disposition"] = (
        "attachment; filename=Anotacoes.pdf; filename*=UTF-8''Anota%C3%A7%C3%B5es.pdf"
    )
    fake.initial = fake.file
    async with SigaaClient(CREDENTIALS, transport=fake.transport) as client:
        _, filename, _ = await read_material(client, MATERIAL_IDS[0])
    assert filename == "Anotações.pdf"


async def test_transmite_arquivo_grande_em_blocos_e_fecha_ao_interromper():
    class LargeFile(httpx.AsyncByteStream):
        read = 0
        closed = False

        async def __aiter__(self):
            for _ in range(128):
                self.read += 1
                yield b"x" * (64 * 1024)

        async def aclose(self):
            self.closed = True

    stream = LargeFile()
    fake = MaterialSigaa()
    fake.initial = httpx.Response(
        200,
        stream=stream,
        headers={"content-disposition": 'attachment; filename="grande.zip"'},
    )
    async with SigaaClient(CREDENTIALS, transport=fake.transport) as client:
        async with client.classrooms.download_classroom_material(
            "AAA", MATERIAL_IDS[0]
        ) as file:
            assert len(await anext(file.content)) == 64 * 1024
            assert stream.read == 1
        assert stream.closed


@pytest.mark.parametrize(
    "target",
    [
        "https://example.org/file",
        "http://arquivos.unb.br/file",
        "https://arquivos.unb.br.evil.test/file",
        "https://sigaa.unb.br@evil.test/file",
        "https://arquivos.unb.br:8443/file",
        "//localhost/file",
    ],
)
async def test_destino_nao_permitido_e_recusado_antes_da_requisicao(target):
    fake = MaterialSigaa()
    fake.initial = httpx.Response(302, headers={"location": target})
    async with SigaaClient(CREDENTIALS, transport=fake.transport) as client:
        with pytest.raises(SigaaParseError):
            await read_material(client, MATERIAL_IDS[0])
    assert all(
        request.url.host in ("sigaa.unb.br", "autenticacao.unb.br")
        for request in fake.requests
    )


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(200, text='<html><form><input type="password"></form></html>'),
        httpx.Response(200, text='<html><ul class="erros"><li>Erro</li></ul></html>'),
        httpx.Response(
            200,
            text="<html>Intermediária</html>",
            headers={"content-type": "application/pdf"},
        ),
        httpx.Response(200, json={"message": "Arquivo indisponível"}),
        httpx.Response(
            200,
            content=b"",
            headers={"content-disposition": 'attachment; filename="vazio.txt"'},
        ),
        httpx.Response(204),
    ],
)
async def test_resposta_sem_arquivo_falha(response):
    fake = MaterialSigaa()
    fake.initial = response
    async with SigaaClient(CREDENTIALS, transport=fake.transport) as client:
        with pytest.raises(SigaaParseError):
            await read_material(client, MATERIAL_IDS[0])


async def test_valida_cada_destino_da_cadeia_de_redirecionamentos():
    fake = MaterialSigaa()
    fake.initial = httpx.Response(
        302, headers={"location": "https://arquivos.unb.br/material"}
    )
    fake.file = httpx.Response(302, headers={"location": "https://example.org/segredo"})
    async with SigaaClient(CREDENTIALS, transport=fake.transport) as client:
        with pytest.raises(SigaaParseError):
            await read_material(client, MATERIAL_IDS[0])
    assert fake.requests[-1].url.host == "arquivos.unb.br"


@pytest.mark.parametrize("status", [307, 308])
async def test_redirecionamento_que_exige_reenvio_do_post_e_recusado(status):
    fake = MaterialSigaa()
    fake.initial = httpx.Response(
        status, headers={"location": "https://arquivos.unb.br/material"}
    )
    async with SigaaClient(CREDENTIALS, transport=fake.transport) as client:
        with pytest.raises(SigaaParseError):
            await read_material(client, MATERIAL_IDS[0])
    assert all(request.url.host != "arquivos.unb.br" for request in fake.requests)
