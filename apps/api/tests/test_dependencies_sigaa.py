import httpx
import jwt
import pytest
from pydantic import SecretStr
from sigaa_client import Credentials, SigaaError

from api.core.config import settings
from api.dependencies.sigaa import SigaaClientDep
from api.dependencies.sigaa_public import SigaaPublicClientDep
from api.utils.session import ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME

CREDENCIAIS = Credentials(registration="251000000", password=SecretStr("senha"))


async def _sonda(client: SigaaClientDep):
    perfil = await client.profile.get_profile()
    return {"registration": perfil.registration, "session_token": client.session_token}


@pytest.fixture
def sonda(probe_app):
    return probe_app(_sonda)


def _access(response: httpx.Response) -> str | None:
    """O JSESSIONID que a resposta devolveu dentro do cookie de acesso."""
    token = response.cookies.get(ACCESS_COOKIE_NAME)
    if token is None:
        return None
    return jwt.decode(
        token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
    )["session_token"]


def test_sem_refresh_cookie_e_401(sonda, sigaa):
    response = sonda.get("/probe")

    assert response.status_code == 401
    assert response.json()["detail"] == "Not authenticated"
    assert sigaa.logins == 0


def test_refresh_cookie_de_outra_chave_e_401(sonda, sigaa):
    """Sem isso, um cookie forjado viraria 500 em vez de pedir login."""
    forjado = jwt.encode(
        {"registration": "251000000", "password": "senha"},
        "outra-chave-bem-comprida-para-o-hmac-nao-reclamar",
    )

    sonda.cookies.update({REFRESH_COOKIE_NAME: forjado})
    response = sonda.get("/probe")

    assert response.status_code == 401
    assert sigaa.logins == 0


def test_sem_access_cookie_autentica_e_grava_o_token(sonda, sigaa, cookies):
    sonda.cookies.update(cookies(refresh=CREDENCIAIS))
    response = sonda.get("/probe")

    assert response.status_code == 200
    assert response.json()["registration"] == "251000000"
    assert sigaa.logins == 1
    assert _access(response) == "app14~TOKEN1"


def test_access_cookie_vivo_nao_passa_pelo_cas(sonda, sigaa, cookies):
    sigaa.valid_tokens.add("app14~VIVO")

    sonda.cookies.update(cookies(access="app14~VIVO", refresh=CREDENCIAIS))
    response = sonda.get("/probe")

    assert response.status_code == 200
    assert response.json()["session_token"] == "app14~VIVO"
    assert sigaa.logins == 0


def test_sessao_morta_reloga_e_reescreve_o_access_cookie(sonda, sigaa, cookies):
    """O relogin acontece no meio da requisição: quem grava o cookie novo é o
    callback `on_session_renewed`, não o `authenticate()` da entrada."""
    sonda.cookies.update(cookies(access="app14~MORTO", refresh=CREDENCIAIS))
    response = sonda.get("/probe")

    assert response.status_code == 200
    assert sigaa.logins == 1
    assert _access(response) == "app14~TOKEN1"


def test_credenciais_recusadas_viram_401(sonda, sigaa, cookies):
    sigaa.password = "outra"

    sonda.cookies.update(cookies(refresh=CREDENCIAIS))
    response = sonda.get("/probe")

    assert response.status_code == 401
    assert response.json()["detail"] == "Session expired"


def test_sigaa_fora_do_ar_vira_502(sonda, sigaa, cookies):
    sigaa.unavailable = True

    sonda.cookies.update(cookies(refresh=CREDENCIAIS))
    response = sonda.get("/probe")

    assert response.status_code == 502
    assert response.json()["detail"] == "SIGAA is unavailable"


def test_cas_sem_jsessionid_vira_502(sonda, sigaa, cookies):
    """Mudança de layout do CAS não pode ser confundida com senha errada."""
    sigaa.mode = "sem_cookie"

    sonda.cookies.update(cookies(refresh=CREDENCIAIS))
    response = sonda.get("/probe")

    assert response.status_code == 502
    assert response.json()["detail"] == "SIGAA is unavailable"


def test_refresh_cookie_e_reemitido_a_cada_requisicao(sonda, sigaa, cookies):
    """A validade do refresh é deslizante: quem usa a API não é deslogado."""
    sigaa.valid_tokens.add("app14~VIVO")

    sonda.cookies.update(cookies(access="app14~VIVO", refresh=CREDENCIAIS))
    response = sonda.get("/probe")

    assert response.cookies.get(REFRESH_COOKIE_NAME) is not None


async def _sonda_publica(client: SigaaPublicClientDep):
    return {"ok": client is not None}


async def _sonda_publica_que_falha(client: SigaaPublicClientDep):
    raise SigaaError("o SIGAA recusou os filtros")


def test_client_publico_nao_exige_sessao(probe_app, sigaa):
    response = probe_app(_sonda_publica).get("/probe")

    assert response.status_code == 200
    assert sigaa.logins == 0


def test_erro_do_sigaa_na_rota_publica_vira_502(probe_app, sigaa):
    """A dependência é um gerador: o erro da rota volta para ela no `yield`."""
    response = probe_app(_sonda_publica_que_falha).get("/probe")

    assert response.status_code == 502
    assert response.json()["detail"] == "SIGAA is unavailable"
