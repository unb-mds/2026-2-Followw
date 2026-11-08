from datetime import date
from decimal import Decimal
from http.cookies import SimpleCookie

import httpx
import pytest
from sigaa_client import (
    AuthenticationFailed,
    RestaurantCredentials,
    RestaurantStatement,
    SessionExpired,
    SigaaParseError,
)

from api.cookies import (
    ACCESS_COOKIE_NAME,
    REFRESH_COOKIE_NAME,
)
from api.db.main import get_sessionmaker

from .helpers import (
    CREDENCIAIS,
    NO_CACHE,
    _entry,
)


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
        restaurant.get_restaurant_statement.return_value = RestaurantStatement(
            balance=Decimal("0.00")
        )
        assert client.get(f"/me/ru-{path}").json() == {
            "balance": "0.00",
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


@pytest.mark.parametrize("group", [1, 2, 3, 4])
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


def test_extrato_sem_grupo_nao_presume_grupo(client, cookies, restaurant):
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    restaurant.get_restaurant_statement.return_value = RestaurantStatement(
        balance=Decimal("20.00"),
        entries=(_entry("Compra de créditos", "20.00"),),
    )
    response = client.get("/me/ru-statement")
    assert response.json()["balance"] == "20.00"
    assert response.json()["group"] is None


def test_extrato_sem_saldo_responde_502(client, cookies, restaurant):
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    restaurant.get_restaurant_statement.side_effect = SigaaParseError(
        "Saldo do RU ausente no extrato."
    )
    assert client.get("/me/ru-statement").status_code == 502


def test_refresh_do_extrato_abre_sessao_nova_para_obter_saldo_atual(
    client, cookies, sigaa, qstash, monkeypatch
):
    sigaa.valid_tokens.add("app14~VIVO")
    client.cookies.update(cookies(access="app14~VIVO", refresh=CREDENCIAIS))
    opened = set()
    balances = {}
    amount = "49,50"

    def dashboard(request):
        token = SimpleCookie(request.headers["cookie"])["JSESSIONID"].value
        assert token in sigaa.valid_tokens
        balance = balances.setdefault(token, amount)
        if request.method == "POST":
            assert token not in opened
            opened.add(token)
        if token in opened:
            return httpx.Response(
                200,
                text=f"""
                <h4>Extrato no Restaurante Universitário</h4><table>
                <tr><td>25/09/2026 22:15</td><td>Saldo</td><td>{balance}</td></tr>
                <tr><td>25/09/2026 12:00</td><td>Grupo 3 Almoço</td><td>-R$ 4,50</td></tr>
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

    original = sigaa._sigaa
    monkeypatch.setattr(
        sigaa,
        "_sigaa",
        lambda request: (
            dashboard(request)
            if request.url.path == "/sigaa/portais/discente/discente.jsf"
            else original(request)
        ),
    )
    assert client.get("/me/ru-statement").json()["balance"] == "49.50"
    amount = "51,00"
    assert client.get("/me/ru-statement").json()["balance"] == "49.50"
    assert sigaa.logins == 0

    response = client.get("/me/ru-statement", headers=NO_CACHE)

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json()["balance"] == "51.00"
    assert response.json()["group"] == 3
    assert len(response.json()["entries"]) == 3
    assert response.json()["entries"][1]["amount"] == "-4.50"
    assert "set-cookie" not in response.headers
    assert (sigaa.logins, sigaa.logouts) == (1, 1)
    assert sigaa.valid_tokens == {"app14~VIVO"}
    assert client.get("/me/ru-statement").json()["balance"] == "49.50"
    assert qstash.published == []


@pytest.mark.parametrize("access", [None, "app14~VIVO"])
@pytest.mark.parametrize("error", [None, SigaaParseError("layout mudou")])
def test_refresh_do_extrato_fecha_client_e_sessao_mesmo_em_falha(
    client, cookies, restaurant, stub_sigaa, qstash, access, error
):
    def banco_proibido():
        pytest.fail("Refresh do RU não deve usar banco")

    client.app.dependency_overrides[get_sessionmaker] = banco_proibido
    client.cookies.update(cookies(access=access, refresh=CREDENCIAIS))
    restaurant.get_restaurant_statement.side_effect = error

    response = client.get("/me/ru-statement", headers=NO_CACHE)

    assert response.status_code == (502 if error else 200)
    assert "set-cookie" not in response.headers
    stub_sigaa.created.assert_called_once()
    assert stub_sigaa.created.call_args.kwargs["session_token"] is None
    assert stub_sigaa.created.call_args.kwargs["credentials"] == CREDENCIAIS
    stub_sigaa.authenticate.assert_awaited_once()
    stub_sigaa.logout.assert_awaited_once()
    stub_sigaa.aclose.assert_awaited_once()
    restaurant.get_restaurant_statement.assert_awaited_once()
    assert qstash.published == []


def test_refresh_do_extrato_com_login_recusado_fecha_client_e_limpa_cookies(
    client, cookies, restaurant, stub_sigaa, ler_cookies
):
    client.cookies.update(cookies(access="app14~VIVO", refresh=CREDENCIAIS))
    stub_sigaa.authenticate.side_effect = AuthenticationFailed()

    response = client.get("/me/ru-statement", headers=NO_CACHE)

    assert response.status_code == 401
    expired = ler_cookies(response)
    for name in (ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME):
        assert expired[name].value == ""
        assert expired[name]["max-age"] == "0"
    stub_sigaa.aclose.assert_awaited_once()
    stub_sigaa.logout.assert_not_awaited()
    restaurant.get_restaurant_statement.assert_not_awaited()


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
        (SessionExpired(), 502),
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
    assert "422" in paths["/me/ru-token"]["get"]["responses"]
    assert {"balance", "group", "entries"} <= schema["components"]["schemas"][
        "RestaurantStatement"
    ]["properties"].keys()
    assert schema["components"]["schemas"]["RestaurantStatement"]["properties"][
        "group"
    ]["anyOf"][0]["enum"] == [1, 2, 3, 4]
