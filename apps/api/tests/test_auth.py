import jwt
import pytest
from pydantic import SecretStr
from sigaa_client import Credentials

from api.core.config import settings
from api.utils.session import ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME

CREDENCIAIS = Credentials(registration="251020208", password=SecretStr("senha"))


def _expirados(jar) -> set[str]:
    """Nomes que a resposta mandou o navegador jogar fora."""
    return {
        nome
        for nome, morsel in jar.items()
        if morsel.value == "" and str(morsel["max-age"]) in ("0", "")
    }


def _payload(response, nome: str) -> dict:
    return jwt.decode(
        response.cookies[nome],
        settings.jwt_secret_key,
        algorithms=[settings.jwt_algorithm],
    )


@pytest.mark.parametrize(
    "body",
    [
        pytest.param({"registration": "251020208"}, id="sem-senha"),
        pytest.param({"password": "senha"}, id="sem-matricula"),
        pytest.param({}, id="vazio"),
    ],
)
def test_login_sem_os_campos_obrigatorios_e_422(client, body: dict):
    assert client.post("/auth/sigaa", json=body).status_code == 422


def test_login_guarda_a_sessao_e_as_credenciais(client, sigaa):
    response = client.post(
        "/auth/sigaa", json={"registration": "251020208", "password": "senha"}
    )

    assert response.status_code == 200
    assert response.json() == {"message": "Login successful"}
    assert sigaa.logins == 1
    assert _payload(response, ACCESS_COOKIE_NAME)["session_token"] == "app14~TOKEN1"
    # O refresh guarda a credencial porque a sessão do SIGAA é curta e só o
    # relogin a renova — não há refresh token do lado deles.
    assert _payload(response, REFRESH_COOKIE_NAME)["registration"] == "251020208"


def test_login_com_senha_errada_e_401(client, sigaa):
    sigaa.password = "outra"

    response = client.post(
        "/auth/sigaa", json={"registration": "251020208", "password": "errada"}
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid credentials"
    assert ACCESS_COOKIE_NAME not in response.cookies


def test_login_com_sigaa_fora_do_ar_e_502(client, sigaa):
    sigaa.unavailable = True

    response = client.post(
        "/auth/sigaa", json={"registration": "251020208", "password": "senha"}
    )

    assert response.status_code == 502
    assert response.json()["detail"] == "SIGAA is unavailable"


def test_login_com_cas_fora_do_esperado_e_502(client, sigaa):
    sigaa.mode = "sem_cookie"

    response = client.post(
        "/auth/sigaa", json={"registration": "251020208", "password": "senha"}
    )

    assert response.status_code == 502
    assert "JSESSIONID" in response.json()["detail"]


def test_logout_encerra_no_sigaa_e_apaga_os_cookies(
    client, sigaa, cookies, ler_cookies
):
    sigaa.valid_tokens.add("app14~VIVO")
    client.cookies.update(cookies(access="app14~VIVO", refresh=CREDENCIAIS))

    response = client.delete("/auth/sigaa")

    assert response.status_code == 200
    assert sigaa.logouts == 1
    assert "app14~VIVO" not in sigaa.valid_tokens
    assert _expirados(ler_cookies(response)) == {
        ACCESS_COOKIE_NAME,
        REFRESH_COOKIE_NAME,
    }


def test_logout_sem_sessao_nao_chama_o_sigaa(client, sigaa):
    response = client.delete("/auth/sigaa")

    assert response.status_code == 200
    assert sigaa.logouts == 0


def test_logout_com_sigaa_fora_do_ar_ainda_desloga(client, sigaa, cookies, ler_cookies):
    """Falha na outra ponta não pode prender o usuário numa sessão morta aqui."""
    client.cookies.update(cookies(access="app14~VIVO", refresh=CREDENCIAIS))
    sigaa.unavailable = True

    response = client.delete("/auth/sigaa")

    assert response.status_code == 200
    assert ACCESS_COOKIE_NAME in _expirados(ler_cookies(response))
