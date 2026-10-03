from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
import respx
from pydantic import SecretStr
from sigaa_client import (
    AuthenticationFailed,
    Credentials,
    RestaurantCredentials,
    RestaurantStatement,
    RestaurantStatementEntry,
    SessionExpired,
    SigaaParseError,
)
from sigaa_client.config import SIGAA_BASE_URL

from api.db.main import get_sessionmaker
from api.utils.session import (
    ACCESS_COOKIE_NAME,
    REFRESH_COOKIE_NAME,
    decrypt_cookie,
    encrypt_cookie,
)

CREDENCIAIS = Credentials(registration="251000000", password=SecretStr("senha123"))
NO_CACHE = {"Cache-Control": "no-cache"}
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


def test_login_seguido_de_me_responde_do_cache(client, sigaa):
    sigaa.profile = PERFIL
    login = client.post(
        "/auth/sigaa", json={"registration": "251000000", "password": "senha123"}
    )
    assert login.status_code == 200
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
    assert sigaa.profile_requests == requests_before
    sigaa.profile = PERFIL.replace("3.9524", "4.0")
    assert client.get("/me").json()["ira"] == 3.9524
    assert client.get("/me", headers=NO_CACHE).json()["ira"] == 4.0
    assert client.get("/me").json()["ira"] == 4.0
    assert sigaa.profile_requests == requests_before + 1
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
        refresh = encrypt_cookie(
            REFRESH_COOKIE_NAME,
            {
                "registration": CREDENCIAIS.registration,
                "password": "senha123",
                "exp": int((datetime.now(UTC) - timedelta(minutes=1)).timestamp()),
            },
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
    token = decrypt_cookie(ACCESS_COOKIE_NAME, response.cookies[ACCESS_COOKIE_NAME])
    assert token["session_token"] == "app14~TOKEN1"
    assert REFRESH_COOKIE_NAME in response.cookies


@pytest.mark.parametrize("access", [None, "app14~MORTO"])
def test_me_com_credenciais_recusadas_retorna_401(client, sigaa, cookies, access):
    client.cookies.update(cookies(access=access, refresh=CREDENCIAIS))
    sigaa.password = "senha-alterada"

    assert client.get("/me").status_code == 401


@pytest.mark.parametrize("access", [None, "app14~VIVO"])
def test_me_com_sigaa_indisponivel_retorna_502(client, sigaa, cookies, access):
    sigaa.valid_tokens.add("app14~VIVO")
    client.cookies.update(cookies(access=access, refresh=CREDENCIAIS))
    sigaa.unavailable = True

    response = client.get("/me")

    assert response.status_code == 502
    assert response.json() == {"detail": "SIGAA is unavailable"}


def test_me_com_login_sem_token_retorna_502(client, sigaa, cookies):
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    sigaa.mode = "sem_cookie"

    assert client.get("/me").status_code == 502


@pytest.mark.parametrize(
    "page",
    [
        pytest.param("<html>layout inesperado</html>", id="sem-perfil"),
        pytest.param(PERFIL.replace("3.9524", "invalido"), id="ira-invalido"),
    ],
)
def test_me_com_perfil_invalido_retorna_502(client, sigaa, cookies, page):
    sigaa.valid_tokens.add("app14~VIVO")
    client.cookies.update(cookies(access="app14~VIVO", refresh=CREDENCIAIS))
    sigaa.profile = page

    assert client.get("/me").status_code == 502


def test_me_aceita_indice_zero(client, sigaa, cookies):
    sigaa.valid_tokens.add("app14~VIVO")
    client.cookies.update(cookies(access="app14~VIVO", refresh=CREDENCIAIS))
    sigaa.profile = PERFIL.replace("4.1724", "0")

    response = client.get("/me")

    assert response.status_code == 200
    assert response.json()["mp"] == 0


def test_me_com_erro_http_do_sigaa_retorna_502(client, sigaa, cookies):
    sigaa.valid_tokens.add("app14~VIVO")
    client.cookies.update(cookies(access="app14~VIVO", refresh=CREDENCIAIS))
    sigaa.profile_status = 503

    assert client.get("/me").status_code == 502


def test_me_apos_logout_exige_novo_login(client, sigaa):
    client.post(
        "/auth/sigaa", json={"registration": "251000000", "password": "senha123"}
    )
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


def _entry(description, amount="0.00", *, day=25):
    return RestaurantStatementEntry(
        occurred_at=datetime.fromisoformat(f"2026-09-{day}T12:00:00"),
        description=description,
        amount=Decimal(amount),
    )


@pytest.fixture
def restaurant(stub_sigaa):
    stub_sigaa.restaurant = SimpleNamespace(
        get_restaurant_statement=AsyncMock(
            return_value=RestaurantStatement(
                balance=Decimal("12.50"),
                group=2,
                entries=(
                    _entry("Saldo", "12.50"),
                    _entry("Grupo 2 Almoço", "6.10"),
                ),
            )
        ),
        get_restaurant_credentials=AsyncMock(
            return_value=RestaurantCredentials(
                token="TOKEN-TESTE",
                valid_until=date(2027, 3, 1),
            )
        ),
    )
    return stub_sigaa.restaurant


@pytest.mark.parametrize(
    "path,method",
    [
        ("statement", "get_restaurant_statement"),
        ("token", "get_restaurant_credentials"),
    ],
)
def test_dados_privados_sem_banco_fila_ou_cache(
    client, cookies, restaurant, qstash, path, method
):
    def banco_proibido():
        pytest.fail("Dados privados do RU não devem usar banco")

    client.app.dependency_overrides[get_sessionmaker] = banco_proibido
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    response = client.get(f"/me/ru-{path}")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    if path == "statement":
        assert response.json()["balance"] == "12.50"
        assert response.json()["group"] == 2
        assert len(response.json()["entries"]) == 2
        restaurant.get_restaurant_statement.return_value = RestaurantStatement()
        assert client.get(f"/me/ru-{path}").json() == {
            "balance": None,
            "group": None,
            "entries": [],
        }
    else:
        assert response.json() == {"token": "TOKEN-TESTE", "valid_until": "2027-03-01"}
        restaurant.get_restaurant_credentials.return_value = RestaurantCredentials(
            token="NOVO", valid_until=date(2027, 4, 1)
        )
        assert client.get(f"/me/ru-{path}").json()["token"] == "NOVO"
    assert getattr(restaurant, method).await_count == 2
    assert qstash.published == []


@pytest.mark.parametrize("group", [1, 2, 3])
def test_extrato_repassa_grupo_saldo_e_movimentos_do_client(
    client, cookies, restaurant, group
):
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    restaurant.get_restaurant_statement.return_value = RestaurantStatement(
        balance=Decimal("-1.50"),
        group=group,
        entries=(
            _entry("Grupo 2 Almoço", "6.10", day=20),
            _entry(f"Grupo {group} Jantar", "6.10", day=24),
            _entry("Saldo", "-1.50", day=25),
            _entry("Saldo", "100.00", day=20),
        ),
    )
    response = client.get("/me/ru-statement")
    assert response.status_code == 200
    assert response.json()["group"] == group
    assert response.json()["balance"] == "-1.50"
    assert len(response.json()["entries"]) == 4


def test_extrato_sem_saldo_ou_grupo_nao_presume_valores(client, cookies, restaurant):
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    restaurant.get_restaurant_statement.return_value = RestaurantStatement(
        entries=(_entry("Compra de créditos", "20.00"),),
    )
    response = client.get("/me/ru-statement")
    assert response.json()["balance"] is None
    assert response.json()["group"] is None


def test_extrato_repetido_na_api_preserva_sessao_e_consulta_saldo_atual(
    client, cookies
):
    client.cookies.update(cookies(access="tok", refresh=CREDENCIAIS))
    opened = False
    amount = "49,50"
    methods = []

    def dashboard(request):
        nonlocal opened
        assert "JSESSIONID=tok" in request.headers["cookie"]
        methods.append(request.method)
        if request.method == "POST":
            assert not opened
            opened = True
        if opened:
            return httpx.Response(
                200,
                text=f"""
                <h4>Extrato no Restaurante Universitário</h4><table>
                <tr><td>25/09/2026 22:15</td><td>Saldo</td><td>{amount}</td></tr>
                <tr><td>18/09/2026 22:15</td><td>Saldo Anterior</td><td>49,50</td></tr>
                </table>
            """,
            )
        return httpx.Response(
            200,
            text="""
            <form id="formExibirExtrato" name="formExibirExtrato"
                action="/sigaa/portais/discente/discente.jsf">
              <input type="hidden" name="formExibirExtrato" value="formExibirExtrato">
              <input type="hidden" name="javax.faces.ViewState" value="VS1">
              <a onclick="jsfcljs(document.getElementById('formExibirExtrato'),
                {'formExibirExtrato:botao':'formExibirExtrato:botao'},'');">
                Mostrar Extrato</a>
            </form>
        """,
        )

    with respx.mock as network:
        network.route(
            host="sigaa.unb.br", path="/sigaa/portais/discente/discente.jsf"
        ).mock(side_effect=dashboard)
        for amount in ("49,50", "51,00", "40,00"):
            response = client.get("/me/ru-statement")
            assert response.status_code == 200
            assert response.headers["cache-control"] == "no-store"
            assert response.json()["balance"] == amount.replace(",", ".")
            assert response.json()["group"] is None
            assert len(response.json()["entries"]) == 2
    assert methods == ["GET", "POST", "GET", "GET"]


@pytest.mark.parametrize("path", ["statement", "token"])
def test_dados_privados_exigem_login(client, stub_sigaa, restaurant, path):
    assert client.get(f"/me/ru-{path}").status_code == 401
    stub_sigaa.created.assert_not_called()


@pytest.mark.parametrize(
    "path,method",
    [
        ("statement", "get_restaurant_statement"),
        ("token", "get_restaurant_credentials"),
    ],
)
@pytest.mark.parametrize(
    "error,status",
    [
        (AuthenticationFailed(), 401),
        (SessionExpired(), 401),
        (SigaaParseError("layout mudou"), 502),
        (httpx.ReadTimeout("fora"), 502),
    ],
)
def test_erros_do_sigaa_sao_traduzidos(
    client, cookies, restaurant, path, method, error, status
):
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    getattr(restaurant, method).side_effect = error
    assert client.get(f"/me/ru-{path}").status_code == status


def test_openapi_documenta_dados_privados_do_restaurante(client):
    schema = client.get("/openapi.json").json()
    paths = schema["paths"]
    for path in ("statement", "token"):
        assert paths[f"/me/ru-{path}"]["get"]["tags"] == ["Me"]
        assert {"401", "502"} <= paths[f"/me/ru-{path}"]["get"]["responses"].keys()
    assert {"balance", "group", "entries"} <= schema["components"]["schemas"][
        "RestaurantStatement"
    ]["properties"].keys()


def test_settings_sem_autenticacao_retorna_401(client):
    assert client.get("/me/settings").status_code == 401
    assert (
        client.patch("/me/settings", json={"displayName": "Teste"}).status_code == 401
    )


def test_settings_get_e_patch_ciclo_completo(client, cookies):
    client.cookies.update(cookies(refresh=CREDENCIAIS))

    # Inicialmente vazio
    get_res = client.get("/me/settings")
    assert get_res.status_code == 200
    assert get_res.json() == {
        "displayName": None,
        "defaultRuCampus": None,
        "defaultRuMeal": None,
        "hideRuBalance": None,
        "scheduleView": None,
        "compactMode": None,
        "theme": None,
    }

    # Atualiza apenas displayName
    patch1 = client.patch("/me/settings", json={"displayName": "Nome Customizado"})
    assert patch1.status_code == 200
    assert patch1.json()["displayName"] == "Nome Customizado"
    assert patch1.json()["defaultRuCampus"] is None

    # Confere persistência no GET
    assert client.get("/me/settings").json()["displayName"] == "Nome Customizado"

    # Atualiza incrementalmente configurações sem perder displayName
    patch2 = client.patch(
        "/me/settings",
        json={
            "defaultRuCampus": "Gama",
            "defaultRuMeal": "lunch",
            "hideRuBalance": True,
            "scheduleView": "week",
            "compactMode": False,
            "theme": "dark",
        },
    )
    assert patch2.status_code == 200
    data2 = patch2.json()
    assert data2["displayName"] == "Nome Customizado"
    assert data2["defaultRuCampus"] == "Gama"
    assert data2["defaultRuMeal"] == "lunch"
    assert data2["hideRuBalance"] is True
    assert data2["scheduleView"] == "week"
    assert data2["compactMode"] is False
    assert data2["theme"] == "dark"

    # Limpa displayName passando null
    patch3 = client.patch("/me/settings", json={"displayName": None})
    assert patch3.status_code == 200
    assert patch3.json()["displayName"] is None
    assert patch3.json()["defaultRuCampus"] == "Gama"

    # Rejeita campos com valores inválidos
    for invalid_payload in [
        {"defaultRuCampus": "CampusInexistente"},
        {"defaultRuMeal": "snack"},
        {"scheduleView": "month"},
        {"theme": "neon"},
    ]:
        invalid = client.patch("/me/settings", json=invalid_payload)
        assert invalid.status_code == 422


def test_settings_aceita_campos_adicionais_e_snake_case(client, cookies):
    client.cookies.update(cookies(refresh=CREDENCIAIS))

    patch = client.patch(
        "/me/settings",
        json={
            "display_name": "Snake",
            "default_ru_campus": "Ceilandia",
            "customPreference": True,
        },
    )
    assert patch.status_code == 200
    data = patch.json()
    assert data["displayName"] == "Snake"
    assert data["defaultRuCampus"] == "Ceilandia"
    assert data["customPreference"] is True


def test_openapi_documenta_settings(client):
    schema = client.get("/openapi.json").json()
    paths = schema["paths"]
    assert "/me/settings" in paths
    assert "get" in paths["/me/settings"]
    assert "patch" in paths["/me/settings"]
    assert paths["/me/settings"]["get"]["tags"] == ["Me"]
    assert paths["/me/settings"]["patch"]["tags"] == ["Me"]
