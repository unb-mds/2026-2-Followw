import httpx
import pytest
from joserfc import jwt
from joserfc.jwe import JWERegistry
from joserfc.jwk import OctKey
from pydantic import SecretStr
from sigaa_client import Credentials, SessionExpired, SigaaError

from api.core.config import settings
from api.dependencies.sigaa import SigaaClientDep
from api.dependencies.sigaa_public import SigaaPublicClientDep
from api.utils.session import ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME, decrypt_cookie

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
    return decrypt_cookie(ACCESS_COOKIE_NAME, token)["session_token"]


def test_sem_refresh_cookie_e_401(sonda, sigaa):
    response = sonda.get("/probe")

    assert response.status_code == 401
    assert response.json()["detail"] == "Not authenticated"
    assert sigaa.logins == 0


def test_refresh_cookie_de_outra_chave_e_401(sonda, sigaa):
    """Sem isso, um cookie forjado viraria 500 em vez de pedir login."""
    forjado = jwt.encode(
        {"alg": "dir", "enc": "A256GCM"},
        {"registration": "251000000", "password": "senha"},
        OctKey.generate_key(256),
        registry=JWERegistry(),
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


def test_sessao_renovada_nao_repete_os_cookies(sonda, sigaa, cookies):
    sonda.cookies.update(cookies(access="app14~MORTO", refresh=CREDENCIAIS))
    response = sonda.get("/probe")

    nomes = [
        header.split("=", 1)[0] for header in response.headers.get_list("set-cookie")
    ]
    assert sorted(nomes) == [ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME]
    assert _access(response) == "app14~TOKEN1"


def test_credenciais_recusadas_viram_401_e_apagam_os_cookies(
    sonda, sigaa, cookies, ler_cookies
):
    sigaa.password = "outra"

    sonda.cookies.update(cookies(access="app14~MORTO", refresh=CREDENCIAIS))
    response = sonda.get("/probe")

    assert response.status_code == 401
    assert response.json()["detail"] == "Session expired"
    jar = ler_cookies(response)
    assert {nome: jar[nome].value for nome in jar} == {
        ACCESS_COOKIE_NAME: "",
        REFRESH_COOKIE_NAME: "",
    }
    assert jar[REFRESH_COOKIE_NAME]["max-age"] == "0"


def test_sessao_irrecuperavel_vira_401_sem_apagar_os_cookies(
    probe_app, sigaa, cookies, ler_cookies
):
    """A senha ainda vale: uma falha de sessão não pode deslogar o usuário."""

    async def falha(client: SigaaClientDep):
        raise SessionExpired("contexto perdido")

    sonda = probe_app(falha)
    sonda.cookies.update(cookies(refresh=CREDENCIAIS))
    response = sonda.get("/probe")

    assert response.status_code == 401
    assert REFRESH_COOKIE_NAME not in ler_cookies(response)


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


def test_cookies_sao_renovados_a_cada_requisicao(sonda, sigaa, cookies, ler_cookies):
    """A validade é deslizante: quem usa a API não é deslogado."""
    sigaa.valid_tokens.add("app14~VIVO")

    sonda.cookies.update(cookies(access="app14~VIVO", refresh=CREDENCIAIS))
    response = sonda.get("/probe")

    jar = ler_cookies(response)
    assert jar[ACCESS_COOKIE_NAME]["max-age"] == str(
        settings.access_token_expire_minutes * 60
    )
    assert _access(response) == "app14~VIVO"
    assert REFRESH_COOKIE_NAME in jar


def test_erro_do_sigaa_nao_renova_os_cookies(sonda, sigaa, cookies):
    sigaa.unavailable = True

    sonda.cookies.update(cookies(access="app14~VIVO", refresh=CREDENCIAIS))
    response = sonda.get("/probe")

    assert response.status_code == 502
    assert "set-cookie" not in response.headers


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
