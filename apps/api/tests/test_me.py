from datetime import UTC, datetime, timedelta

import jwt
import pytest
from pydantic import SecretStr
from sigaa_client import Credentials
from sigaa_client.config import SIGAA_BASE_URL

from api.core.config import settings
from api.utils.session import ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME

CREDENCIAIS = Credentials(registration="251000000", password=SecretStr("senha"))
PERFIL = """
<html><body><div id="perfil-docente">
  <div class="foto"><img src="/arquivos/foto.jpg" /></div>
  <div class="info-docente"><span class="nome">NOME DISCENTE</span>Bio de teste.</div>
  <table>
    <tr><td>Matrícula:</td><td>251000000</td></tr>
    <tr><td>Curso:</td><td>ENGENHARIA DE SOFTWARE/FCTE - Bacharelado</td></tr>
    <tr><td>Nível:</td><td>GRADUAÇÃO</td></tr>
    <tr><td colspan="2"><table>
      <tr><td><acronym>IRA:</acronym></td><td>3.9524</td></tr>
      <tr><td><acronym>MP:</acronym></td><td>4.1724</td></tr>
    </table></td></tr>
  </table>
  <span>35% Integralizado</span>
</div></body></html>
"""


def test_login_seguido_de_me_retorna_o_perfil_atualizado(client, sigaa):
    login = client.post(
        "/auth/sigaa", json={"registration": "251000000", "password": "senha"}
    )
    assert login.status_code == 200
    sigaa.profile = PERFIL
    requests_before = sigaa.profile_requests

    response = client.get("/me")

    assert response.status_code == 200
    assert response.json() == {
        "name": "NOME DISCENTE",
        "registration": "251000000",
        "photo": f"{SIGAA_BASE_URL}/arquivos/foto.jpg",
        "email": None,
        "bio": "Bio de teste.",
        "unity": "FCTE",
        "course": "ENGENHARIA DE SOFTWARE",
        "integralization": 35,
        "ira": 3.9524,
        "mp": 4.1724,
        "level": "Graduação",
    }
    sigaa.profile = PERFIL.replace("3.9524", "4.0")
    assert client.get("/me").json()["ira"] == 4.0
    assert sigaa.profile_requests == requests_before + 2
    assert sigaa.logins == 1


def test_me_sem_campos_opcionais_retorna_null(client, sigaa, cookies):
    client.cookies.update(cookies(refresh=CREDENCIAIS))

    response = client.get("/me")

    assert response.status_code == 200
    for field in ("photo", "email", "bio", "integralization", "ira", "mp"):
        assert response.json()[field] is None


@pytest.mark.parametrize("refresh", [None, "cookie-invalido", "expirado"])
def test_me_sem_refresh_valido_retorna_401(client, sigaa, cookies, refresh):
    sigaa.valid_tokens.add("app14~VIVO")
    client.cookies.update(cookies(access="app14~VIVO"))
    if refresh == "expirado":
        refresh = jwt.encode(
            {
                "registration": CREDENCIAIS.registration,
                "password": "senha",
                "exp": datetime.now(UTC) - timedelta(minutes=1),
            },
            settings.jwt_secret_key,
            algorithm=settings.jwt_algorithm,
        )
    if refresh is not None:
        client.cookies.set(REFRESH_COOKIE_NAME, refresh)

    response = client.get("/me")

    assert response.status_code == 401
    assert sigaa.logins == 0


def test_me_sem_cookies_retorna_401(client, sigaa):
    assert client.get("/me").status_code == 401
    assert sigaa.logins == 0


@pytest.mark.parametrize("access", [None, "app14~MORTO"])
def test_me_renova_sessao_e_devolve_cookies(client, sigaa, cookies, access):
    client.cookies.update(cookies(access=access, refresh=CREDENCIAIS))

    response = client.get("/me")

    assert response.status_code == 200
    assert sigaa.logins == 1
    token = jwt.decode(
        response.cookies[ACCESS_COOKIE_NAME],
        settings.jwt_secret_key,
        algorithms=[settings.jwt_algorithm],
    )
    assert token["session_token"] == "app14~TOKEN1"
    assert REFRESH_COOKIE_NAME in response.cookies


@pytest.mark.parametrize("access", [None, "app14~MORTO"])
def test_me_com_credenciais_recusadas_retorna_401(client, sigaa, cookies, access):
    client.cookies.update(cookies(access=access, refresh=CREDENCIAIS))
    sigaa.password = "senha-alterada"

    assert client.get("/me").status_code == 401


@pytest.mark.parametrize("access", [None, "app14~VIVO"])
def test_me_com_sigaa_indisponivel_retorna_401(client, sigaa, cookies, access):
    sigaa.valid_tokens.add("app14~VIVO")
    client.cookies.update(cookies(access=access, refresh=CREDENCIAIS))
    sigaa.unavailable = True

    response = client.get("/me")

    assert response.status_code == 401
    assert response.json() == {"detail": "SIGAA is unavailable"}


def test_me_com_login_sem_token_retorna_401(client, sigaa, cookies):
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    sigaa.mode = "sem_cookie"

    assert client.get("/me").status_code == 401


@pytest.mark.parametrize(
    "page",
    [
        pytest.param("<html>layout inesperado</html>", id="sem-perfil"),
        pytest.param(PERFIL.replace("3.9524", "invalido"), id="ira-invalido"),
    ],
)
def test_me_com_perfil_invalido_retorna_401(client, sigaa, cookies, page):
    sigaa.valid_tokens.add("app14~VIVO")
    client.cookies.update(cookies(access="app14~VIVO", refresh=CREDENCIAIS))
    sigaa.profile = page

    assert client.get("/me").status_code == 401


def test_me_aceita_indice_zero(client, sigaa, cookies):
    sigaa.valid_tokens.add("app14~VIVO")
    client.cookies.update(cookies(access="app14~VIVO", refresh=CREDENCIAIS))
    sigaa.profile = PERFIL.replace("4.1724", "0")

    response = client.get("/me")

    assert response.status_code == 200
    assert response.json()["mp"] == 0


def test_me_com_erro_http_do_sigaa_retorna_401(client, sigaa, cookies):
    sigaa.valid_tokens.add("app14~VIVO")
    client.cookies.update(cookies(access="app14~VIVO", refresh=CREDENCIAIS))
    sigaa.profile_status = 503

    assert client.get("/me").status_code == 401


def test_me_apos_logout_exige_novo_login(client, sigaa):
    client.post("/auth/sigaa", json={"registration": "251000000", "password": "senha"})
    assert client.get("/me").status_code == 200
    assert client.delete("/auth/sigaa").status_code == 200
    assert client.get("/me").status_code == 401


def test_me_documenta_campos_e_erros(client):
    schema = client.get("/openapi.json").json()
    route = schema["paths"]["/me"]["get"]
    assert "401" in route["responses"]
    fields = schema["components"]["schemas"]["UserProfile"]["properties"]
    assert {
        "name",
        "photo",
        "email",
        "bio",
        "unity",
        "course",
        "integralization",
        "ira",
        "mp",
    } <= fields.keys()
    assert "password" not in fields
    assert "session_token" not in fields
