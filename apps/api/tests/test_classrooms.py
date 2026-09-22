from datetime import UTC, datetime, timedelta

import jwt
import pytest
from pydantic import SecretStr
from sigaa_client import Credentials

from api.core.config import settings
from api.utils.session import ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME

CREDENCIAIS = Credentials(registration="251000000", password=SecretStr("senha"))
DASHBOARD = """
<table>
  <tr><td colspan="5">2026.2</td></tr>
  <tr>
    <td class="descricao"><form id="form_acessarTurmaVirtual">
      <a href="#" onclick="jsfcljs(x,{'frontEndIdTurma':'CURRENT'},'');">
        ESTRUTURAS DE DADOS 1
      </a>
    </form></td>
    <td>FCTE - MOCAP</td><td>35M5 35T1</td>
  </tr>
  <tr><td id="linha_123" colspan="5"></td></tr>
</table>
"""
HISTORY = """
<html><body><table class="listagem">
  <tr><td class="periodo">2026.2</td></tr>
  <tr>
    <td>FGA0146 - ESTRUTURAS DE DADOS 1</td><td>01</td>
    <td>60h</td><td>35M5 35T1</td>
    <td><a title="Acessar Turma Virtual"
      onclick="jsfcljs(x,{'frontEndIdTurma':'CURRENT'},'');">Acessar</a></td>
  </tr>
  <tr><td class="periodo">2025.2</td></tr>
  <tr>
    <td>FGA0158 - ORIENTAÇÃO A OBJETOS</td><td>02</td>
    <td>60h</td><td>24T23</td>
    <td><a title="Acessar Turma Virtual"
      onclick="jsfcljs(x,{'frontEndIdTurma':'OLD'},'');">Acessar</a></td>
  </tr>
</table></body></html>
"""


@pytest.fixture
def classrooms_sigaa(sigaa):
    sigaa.profile = sigaa.profile.replace("</body>", f"{DASHBOARD}</body>")
    sigaa.classrooms = HISTORY
    return sigaa


def test_login_e_listagem_retornam_apenas_turmas_atuais(client, classrooms_sigaa):
    login = client.post(
        "/auth/sigaa", json={"registration": "251000000", "password": "senha"}
    )
    assert login.status_code == 200

    response = client.get("/classrooms")

    assert response.status_code == 200
    assert response.json() == [
        {
            "id": "CURRENT",
            "sigaa_id": 123,
            "number": "01",
            "semester": "2026.2",
            "schedule": "35M5 35T1",
            "room": "MOCAP",
            "subject": {
                "name": "ESTRUTURAS DE DADOS 1",
                "code": "FGA0146",
                "hours": 60,
                "unity": "FCTE",
                "sigaa_id": None,
            },
        }
    ]
    assert classrooms_sigaa.logins == 1
    assert classrooms_sigaa.classrooms_requests == 1
    assert client.get("/me").status_code == 200


def test_listagem_reflete_alteracoes_no_sigaa(client, classrooms_sigaa, cookies):
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    assert client.get("/classrooms").json()[0]["room"] == "MOCAP"
    classrooms_sigaa.profile = classrooms_sigaa.profile.replace("MOCAP", "SALA 02")

    response = client.get("/classrooms")

    assert response.status_code == 200
    assert response.json()[0]["room"] == "SALA 02"
    assert classrooms_sigaa.classrooms_requests == 2


def test_lista_todas_as_turmas_ativas(client, classrooms_sigaa, cookies):
    second_row = """
      <tr><td class="descricao"><form id="form_acessarTurmaVirtual2">
        <a onclick="jsfcljs(x,{'frontEndIdTurma':'SECOND'},'');">OUTRA DISCIPLINA</a>
      </form></td><td>FCTE - SALA 02</td><td>24T23</td></tr>
    """
    classrooms_sigaa.profile = classrooms_sigaa.profile.replace(
        DASHBOARD, DASHBOARD.replace("</table>", f"{second_row}</table>")
    )
    classrooms_sigaa.classrooms = HISTORY.replace("2025.2", "2026.2").replace(
        "'OLD'", "'SECOND'"
    )
    client.cookies.update(cookies(refresh=CREDENCIAIS))

    response = client.get("/classrooms")

    assert response.status_code == 200
    assert [item["id"] for item in response.json()] == ["CURRENT", "SECOND"]


def test_sem_turmas_atuais_retorna_lista_vazia(client, sigaa, cookies):
    sigaa.classrooms = HISTORY
    client.cookies.update(cookies(refresh=CREDENCIAIS))

    response = client.get("/classrooms")

    assert response.status_code == 200
    assert response.json() == []


def test_campos_opcionais_ausentes_retornam_null(client, classrooms_sigaa, cookies):
    classrooms_sigaa.profile = classrooms_sigaa.profile.replace(
        "FCTE - MOCAP", ""
    ).replace("35M5 35T1", "")
    classrooms_sigaa.classrooms = HISTORY.replace("60h", "").replace("35M5 35T1", "")
    client.cookies.update(cookies(refresh=CREDENCIAIS))

    response = client.get("/classrooms")

    assert response.status_code == 200
    classroom = response.json()[0]
    assert classroom["room"] is None
    assert classroom["schedule"] is None
    assert classroom["subject"]["unity"] is None
    assert classroom["subject"]["hours"] is None


@pytest.mark.parametrize("refresh", [None, "invalido", "expirado"])
def test_sem_credenciais_validas_retorna_401(client, sigaa, refresh):
    if refresh == "expirado":
        refresh = jwt.encode(
            {
                "registration": "251000000",
                "password": "senha",
                "exp": datetime.now(UTC) - timedelta(minutes=1),
            },
            settings.jwt_secret_key,
            algorithm=settings.jwt_algorithm,
        )
    if refresh is not None:
        client.cookies.set(REFRESH_COOKIE_NAME, refresh)

    assert client.get("/classrooms").status_code == 401
    assert sigaa.logins == 0
    assert sigaa.classrooms_requests == 0


@pytest.mark.parametrize("access", [None, "app14~MORTO"])
def test_renova_sessao_e_retorna_as_turmas(client, classrooms_sigaa, cookies, access):
    client.cookies.update(cookies(access=access, refresh=CREDENCIAIS))

    response = client.get("/classrooms")

    assert response.status_code == 200
    assert response.json()[0]["id"] == "CURRENT"
    assert classrooms_sigaa.logins == 1
    assert ACCESS_COOKIE_NAME in response.cookies
    assert REFRESH_COOKIE_NAME in response.cookies
    assert client.get("/classrooms").status_code == 200
    assert classrooms_sigaa.logins == 1


@pytest.mark.parametrize("access", [None, "app14~MORTO"])
def test_senha_recusada_retorna_401(client, classrooms_sigaa, cookies, access):
    classrooms_sigaa.password = "senha-alterada"
    client.cookies.update(cookies(access=access, refresh=CREDENCIAIS))

    assert client.get("/classrooms").status_code == 401


@pytest.mark.parametrize("access", [None, "app14~VIVO"])
def test_sigaa_indisponivel_retorna_502(client, classrooms_sigaa, cookies, access):
    classrooms_sigaa.unavailable = True
    client.cookies.update(cookies(access=access, refresh=CREDENCIAIS))

    response = client.get("/classrooms")

    assert response.status_code == 502
    assert response.json() == {"detail": "SIGAA is unavailable"}


@pytest.mark.parametrize("status_code", [403, 500, 503])
def test_erro_http_na_listagem_retorna_502(
    client, classrooms_sigaa, cookies, status_code
):
    classrooms_sigaa.classrooms_status = status_code
    client.cookies.update(cookies(refresh=CREDENCIAIS))

    assert client.get("/classrooms").status_code == 502


def test_html_da_listagem_invalido_retorna_502(client, classrooms_sigaa, cookies):
    classrooms_sigaa.classrooms = "<html>layout inesperado</html>"
    client.cookies.update(cookies(refresh=CREDENCIAIS))

    assert client.get("/classrooms").status_code == 502


def test_logout_impede_nova_consulta(client, classrooms_sigaa):
    client.post("/auth/sigaa", json={"registration": "251000000", "password": "senha"})
    assert client.get("/classrooms").status_code == 200
    assert client.delete("/auth/sigaa").status_code == 200
    assert client.get("/classrooms").status_code == 401


def test_openapi_documenta_lista_de_turmas_e_401(client):
    schema = client.get("/openapi.json").json()
    route = schema["paths"]["/classrooms"]["get"]
    assert "401" in route["responses"]
    response_schema = route["responses"]["200"]["content"]["application/json"]["schema"]
    assert response_schema["type"] == "array"
    assert response_schema["items"]["$ref"] == "#/components/schemas/Classroom"
    assert {"number", "semester", "schedule", "room", "subject"} <= schema[
        "components"
    ]["schemas"]["Classroom"]["properties"].keys()
    assert {"name", "code", "hours", "unity"} <= schema["components"]["schemas"][
        "Subject"
    ]["properties"].keys()
    parameter = next(p for p in route["parameters"] if p["name"] == "semester")
    assert parameter["in"] == "query"
    assert parameter["required"] is False
    assert "422" in route["responses"]
    assert "502" in route["responses"]


@pytest.mark.parametrize(
    "semester,expected",
    [
        ("all", ["CURRENT", "OLD"]),
        ("2026.2", ["CURRENT"]),
        ("2025.2", ["OLD"]),
        ("2020.1", []),
    ],
)
def test_filtro_por_semestre_consulta_as_duas_paginas_uma_vez(
    client, classrooms_sigaa, cookies, semester, expected
):
    classrooms_sigaa.valid_tokens.add("app14~VIVO")
    client.cookies.update(cookies(access="app14~VIVO", refresh=CREDENCIAIS))

    response = client.get("/classrooms", params={"semester": semester})

    assert response.status_code == 200
    assert [classroom["id"] for classroom in response.json()] == expected
    assert classrooms_sigaa.profile_requests == 1
    assert classrooms_sigaa.classrooms_requests == 1
    assert classrooms_sigaa.logins == 0


def test_historico_preserva_campos_das_turmas_atuais(client, classrooms_sigaa, cookies):
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    current = client.get("/classrooms").json()

    response = client.get("/classrooms?semester=all")

    assert response.status_code == 200
    assert response.json()[0] == current[0]
    assert response.json()[1] == {
        "id": "OLD",
        "sigaa_id": None,
        "number": "02",
        "semester": "2025.2",
        "schedule": "24T23",
        "room": None,
        "subject": {
            "name": "ORIENTAÇÃO A OBJETOS",
            "code": "FGA0158",
            "hours": 60,
            "unity": None,
            "sigaa_id": None,
        },
    }


@pytest.mark.parametrize("semester", ["", "2026", "2026-2", "2026.22", "ALL"])
def test_semestre_invalido_retorna_422_sem_buscar_turmas(
    client, classrooms_sigaa, cookies, semester
):
    classrooms_sigaa.valid_tokens.add("app14~VIVO")
    client.cookies.update(cookies(access="app14~VIVO", refresh=CREDENCIAIS))

    response = client.get("/classrooms", params={"semester": semester})

    assert response.status_code == 422
    assert classrooms_sigaa.profile_requests == 0
    assert classrooms_sigaa.classrooms_requests == 0


def test_filtro_renova_sessao_expirada(client, classrooms_sigaa, cookies):
    client.cookies.update(cookies(access="app14~MORTO", refresh=CREDENCIAIS))

    response = client.get("/classrooms?semester=all")

    assert response.status_code == 200
    assert any(item["id"] == "OLD" for item in response.json())
    assert classrooms_sigaa.logins == 1
    assert ACCESS_COOKIE_NAME in response.cookies


def test_filtro_com_erro_no_sigaa_retorna_502(client, classrooms_sigaa, cookies):
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    classrooms_sigaa.classrooms_status = 503

    assert client.get("/classrooms?semester=all").status_code == 502
