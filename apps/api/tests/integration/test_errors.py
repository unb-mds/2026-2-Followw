import httpx
import pytest
from sigaa_client import AuthenticationFailed, SessionExpired, SigaaParseError


@pytest.mark.parametrize(
    "error,status",
    [
        (AuthenticationFailed(), 401),
        (SessionExpired(), 502),
        (SigaaParseError("layout mudou"), 502),
        (httpx.ReadTimeout("fora"), 502),
    ],
)
def test_erros_do_sigaa_sao_traduzidos_num_lugar_so(probe_app, error, status):
    async def falha():
        raise error

    response = probe_app(falha).get("/probe")

    assert response.status_code == status
    # Só a credencial recusada apaga a sessão guardada nos cookies.
    assert ("set-cookie" in response.headers) == (status == 401)
