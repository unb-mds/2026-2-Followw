import httpx
import pytest

from sigaa_client.config import PUBLIC_HOME_PATH, SIGAA_BASE_URL
from sigaa_client.public.session import PublicSession


async def test_home_fora_do_ar_propaga_e_aquece_de_novo_na_proxima():
    respostas = [httpx.Response(503), httpx.Response(200), httpx.Response(200)]
    paths: list[str] = []

    def sigaa(request: httpx.Request) -> httpx.Response:
        paths.append(request.url.path)
        return respostas.pop(0)

    transport = httpx.MockTransport(sigaa)
    async with httpx.AsyncClient(base_url=SIGAA_BASE_URL, transport=transport) as http:
        session = PublicSession(http)
        with pytest.raises(httpx.HTTPStatusError):
            await session.open("/sigaa/public/turmas/listar.jsf")
        await session.open("/sigaa/public/turmas/listar.jsf")

    assert paths == [
        PUBLIC_HOME_PATH,
        PUBLIC_HOME_PATH,
        "/sigaa/public/turmas/listar.jsf",
    ]


@pytest.mark.parametrize("error", [httpx.ConnectError, httpx.ReadTimeout])
async def test_falha_de_rede_na_sessao_publica_chega_ao_chamador(error):
    def sigaa(request: httpx.Request) -> httpx.Response:
        raise error("SIGAA fora do ar", request=request)

    transport = httpx.MockTransport(sigaa)
    async with httpx.AsyncClient(base_url=SIGAA_BASE_URL, transport=transport) as http:
        with pytest.raises(error):
            await PublicSession(http).open("/sigaa/public/turmas/listar.jsf")
