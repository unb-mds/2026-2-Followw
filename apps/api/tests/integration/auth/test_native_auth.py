from pydantic import SecretStr
from sigaa_client import Credentials

from api.cookies import ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME, decrypt_cookie

CREDENCIAIS = Credentials(registration="251000000", password=SecretStr("senha123"))
LOGIN = {"registration": "251000000", "password": "senha123"}

NATIVO = {"X-Followw-Auth": "header"}


def _nativo(**tokens: str) -> dict[str, str]:
    return {**NATIVO, **{f"X-Followw-{k.title()}": v for k, v in tokens.items()}}


def test_login_nativo_devolve_tokens_nos_headers_sem_set_cookie(client, sigaa):
    response = client.post("/auth/sigaa", json=LOGIN, headers=NATIVO)

    assert response.status_code == 200
    assert "set-cookie" not in response.headers
    access = decrypt_cookie(ACCESS_COOKIE_NAME, response.headers["x-followw-access"])
    refresh = decrypt_cookie(REFRESH_COOKIE_NAME, response.headers["x-followw-refresh"])
    assert access["session_token"] == "app14~TOKEN1"
    assert refresh["registration"] == "251000000"


def test_refresh_nativo_com_headers_autentica(client, sigaa, cookies, qstash):
    jar = cookies(access="app14~VIVO", refresh=CREDENCIAIS)
    headers = _nativo(access=jar[ACCESS_COOKIE_NAME], refresh=jar[REFRESH_COOKIE_NAME])

    response = client.post("/auth/sigaa/refresh", headers=headers)

    assert response.status_code == 204
    assert "set-cookie" not in response.headers
    assert "x-followw-access" not in response.headers
    assert sigaa.valid_tokens == set()


def test_refresh_nativo_sem_access_renova_nos_headers(client, sigaa, cookies, qstash):
    jar = cookies(refresh=CREDENCIAIS)
    headers = _nativo(refresh=jar[REFRESH_COOKIE_NAME])

    response = client.post("/auth/sigaa/refresh", headers=headers)

    assert response.status_code == 204
    assert "set-cookie" not in response.headers
    access = decrypt_cookie(ACCESS_COOKIE_NAME, response.headers["x-followw-access"])
    assert access["session_token"] == "app14~TOKEN1"
    assert "x-followw-refresh" in response.headers


def test_modo_nativo_ignora_os_cookies(client, sigaa, cookies):
    client.cookies.update(cookies(access="app14~VIVO", refresh=CREDENCIAIS))

    response = client.post("/auth/sigaa/refresh", headers=NATIVO)

    assert response.status_code == 401


def test_sem_header_de_modo_os_headers_de_token_sao_ignorados(client, sigaa, cookies):
    jar = cookies(refresh=CREDENCIAIS)

    response = client.post(
        "/auth/sigaa/refresh", headers={"X-Followw-Refresh": jar[REFRESH_COOKIE_NAME]}
    )

    assert response.status_code == 401


def test_sem_header_de_modo_o_login_segue_por_cookies(client, sigaa):
    response = client.post("/auth/sigaa", json=LOGIN)

    assert ACCESS_COOKIE_NAME in response.cookies
    assert "x-followw-access" not in response.headers


def test_modo_nativo_com_token_invalido_e_401(client, sigaa):
    headers = _nativo(access="lixo", refresh="lixo")

    response = client.post("/auth/sigaa/refresh", headers=headers)

    assert response.status_code == 401
    assert sigaa.logins == 0


def test_login_nativo_com_senha_errada_e_401_sem_set_cookie(client, sigaa):
    sigaa.password = "outra"

    response = client.post("/auth/sigaa", json=LOGIN, headers=NATIVO)

    assert response.status_code == 401
    assert "set-cookie" not in response.headers


def test_logout_nativo_nao_emite_set_cookie(client, sigaa):
    response = client.delete("/auth/sigaa", headers=NATIVO)

    assert response.status_code == 200
    assert "set-cookie" not in response.headers
