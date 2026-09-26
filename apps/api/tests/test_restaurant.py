from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

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
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from unb_browser import Campus, DailyMenu, MenuSection, UnbParseError
from unb_browser.config import RU_MENU_URL

from api.db.main import get_sessionmaker
from api.db.models import RestaurantMenu
from api.repositories.restaurant import RestaurantRepository

CREDENTIALS = Credentials(registration="251000000", password=SecretStr("senha"))
DAY = DailyMenu(
    date=date(2026, 9, 25),
    lunch=(MenuSection(key="main_dish", name="Prato principal", items=("Frango",)),),
)


@pytest.fixture
def browser(monkeypatch):
    browser = MagicMock()
    browser.__aenter__.return_value = browser
    browser.restaurant.get_menu = AsyncMock(return_value=(DAY,))
    monkeypatch.setattr("api.dependencies.unb_browser.UnbBrowser", lambda: browser)
    return browser


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


def test_menu_publico_grava_antes_de_responder_e_reutiliza_cache(
    client, browser, database, qstash
):
    response = client.get("/restaurant/menu")
    assert response.status_code == 200
    assert response.json() == [DAY.model_dump(mode="json")]
    with database() as session:
        cached = session.scalar(select(RestaurantMenu))
        assert cached.campus == "Darcy Ribeiro"
        assert cached.days == response.json()
    browser.restaurant.get_menu.side_effect = UnbParseError("fora")
    assert client.get("/restaurant/menu").json() == response.json()
    browser.restaurant.get_menu.assert_awaited_once_with(Campus.DARCY_RIBEIRO)
    assert qstash.published == []
    assert browser.__aexit__.await_count == 2


def test_menu_cache_separado_por_campus_e_refresh(client, browser, database):
    client.get("/restaurant/menu")
    browser.restaurant.get_menu.return_value = ()
    assert client.get("/restaurant/menu", params={"campus": "Gama"}).json() == []
    assert client.get("/restaurant/menu").json() == [DAY.model_dump(mode="json")]
    assert client.get("/restaurant/menu?refresh=true").json() == []
    assert client.get("/restaurant/menu").json() == []
    assert browser.restaurant.get_menu.await_count == 3
    with database() as session:
        assert len(list(session.scalars(select(RestaurantMenu)))) == 2


def test_menu_vencido_reconsulta_e_substitui_cache(client, browser, database):
    client.get("/restaurant/menu")
    with database() as session:
        session.execute(
            update(RestaurantMenu).values(
                synced_at=datetime.now(UTC) - timedelta(hours=7)
            )
        )
        session.commit()
    browser.restaurant.get_menu.return_value = (DAY.model_copy(update={"lunch": None}),)
    response = client.get("/restaurant/menu")
    assert response.status_code == 200
    assert response.json()[0]["lunch"] is None
    assert client.get("/restaurant/menu").json() == response.json()
    assert browser.restaurant.get_menu.await_count == 2


@pytest.mark.parametrize("method", ["get", "save"])
@pytest.mark.parametrize(
    "error", [SQLAlchemyError("banco indisponível"), OSError("conexão recusada")]
)
def test_falha_do_banco_nao_impede_cardapio(
    client, browser, monkeypatch, method, error
):
    monkeypatch.setattr(RestaurantRepository, method, AsyncMock(side_effect=error))
    response = client.get("/restaurant/menu")
    assert response.status_code == 200
    assert response.json() == [DAY.model_dump(mode="json")]


def test_falha_no_commit_preserva_cache_e_retorna_menu_novo(
    client, browser, database, monkeypatch
):
    from sqlalchemy.ext.asyncio import AsyncSession

    original = client.get("/restaurant/menu").json()
    browser.restaurant.get_menu.return_value = ()
    monkeypatch.setattr(
        AsyncSession,
        "commit",
        AsyncMock(side_effect=SQLAlchemyError("falha no commit")),
    )
    assert client.get("/restaurant/menu?refresh=true").json() == []
    with database() as session:
        assert session.scalar(select(RestaurantMenu)).days == original


def test_conflito_entre_gravacoes_nao_impede_resposta(client, browser, monkeypatch):
    monkeypatch.setattr(
        RestaurantRepository,
        "save",
        AsyncMock(side_effect=IntegrityError("insert", {}, Exception("duplicado"))),
    )
    assert client.get("/restaurant/menu").json() == [DAY.model_dump(mode="json")]


def test_menu_em_cache_invalido_e_refeito(client, browser, database):
    client.get("/restaurant/menu")
    with database() as session:
        session.execute(update(RestaurantMenu).values(days=[{"date": "inválida"}]))
        session.commit()
    assert client.get("/restaurant/menu").json() == [DAY.model_dump(mode="json")]
    assert browser.restaurant.get_menu.await_count == 2


@pytest.mark.parametrize(
    "error", [UnbParseError("layout mudou"), httpx.ReadTimeout("fora do ar")]
)
def test_refresh_com_erro_no_ru_preserva_cache(client, browser, error):
    original = client.get("/restaurant/menu").json()
    browser.restaurant.get_menu.side_effect = error
    assert client.get("/restaurant/menu?refresh=true").status_code == 502
    assert client.get("/restaurant/menu").json() == original


def test_menu_rejeita_campus_invalido(client, browser):
    assert client.get("/restaurant/menu?campus=inexistente").status_code == 422
    browser.restaurant.get_menu.assert_not_awaited()


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
    client.cookies.update(cookies(refresh=CREDENTIALS))
    response = client.get(f"/restaurant/{path}")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    if path == "statement":
        assert response.json()["balance"] == "12.50"
        assert response.json()["group"] == 2
        assert len(response.json()["entries"]) == 2
        restaurant.get_restaurant_statement.return_value = RestaurantStatement()
        assert client.get(f"/restaurant/{path}").json() == {
            "balance": None,
            "group": None,
            "entries": [],
        }
    else:
        assert response.json() == {"token": "TOKEN-TESTE", "valid_until": "2027-03-01"}
        restaurant.get_restaurant_credentials.return_value = RestaurantCredentials(
            token="NOVO", valid_until=date(2027, 4, 1)
        )
        assert client.get(f"/restaurant/{path}").json()["token"] == "NOVO"
    assert getattr(restaurant, method).await_count == 2
    assert qstash.published == []


@pytest.mark.parametrize("group", [1, 2, 3])
def test_extrato_repassa_grupo_saldo_e_movimentos_do_client(
    client, cookies, restaurant, group
):
    client.cookies.update(cookies(refresh=CREDENTIALS))
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
    response = client.get("/restaurant/statement")
    assert response.status_code == 200
    assert response.json()["group"] == group
    assert response.json()["balance"] == "-1.50"
    assert len(response.json()["entries"]) == 4


def test_extrato_sem_saldo_ou_grupo_nao_presume_valores(client, cookies, restaurant):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    restaurant.get_restaurant_statement.return_value = RestaurantStatement(
        entries=(_entry("Compra de créditos", "20.00"),),
    )
    response = client.get("/restaurant/statement")
    assert response.json()["balance"] is None
    assert response.json()["group"] is None


def test_extrato_repetido_na_api_preserva_sessao_e_consulta_saldo_atual(
    client, cookies
):
    client.cookies.update(cookies(access="tok", refresh=CREDENTIALS))
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
            response = client.get("/restaurant/statement")
            assert response.status_code == 200
            assert response.headers["cache-control"] == "no-store"
            assert response.json()["balance"] == amount.replace(",", ".")
            assert response.json()["group"] is None
            assert len(response.json()["entries"]) == 2
    assert methods == ["GET", "POST", "GET", "GET"]


@pytest.mark.parametrize("path", ["statement", "token"])
def test_dados_privados_exigem_login(client, stub_sigaa, restaurant, path):
    assert client.get(f"/restaurant/{path}").status_code == 401
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
    client.cookies.update(cookies(refresh=CREDENTIALS))
    getattr(restaurant, method).side_effect = error
    assert client.get(f"/restaurant/{path}").status_code == status


def test_openapi_documenta_restaurante(client):
    schema = client.get("/openapi.json").json()
    paths = schema["paths"]
    menu = paths["/restaurant/menu"]["get"]
    assert {p["name"] for p in menu["parameters"]} == {
        "campus",
        "refresh",
        "date",
        "start_date",
        "end_date",
        "meal",
    }
    assert "401" not in menu["responses"]
    for path in ("statement", "token"):
        assert {"401", "502"} <= paths[f"/restaurant/{path}"]["get"]["responses"].keys()
    assert {"balance", "group", "entries"} <= schema["components"]["schemas"][
        "RestaurantStatement"
    ]["properties"].keys()


def test_cardapio_do_pdf_real_chega_ao_endpoint_e_ao_cache(client):
    fixture = (
        Path(__file__).resolve().parents[3]
        / "packages/unb-browser/tests/fixtures/cardapio-darcy.pdf"
    )
    pdf_url = "https://ru.unb.br/cardapio-teste.pdf"
    with respx.mock as network:
        page = network.get(RU_MENU_URL).respond(
            200, text=f'<h3>Cardápio Darcy Ribeiro</h3><a href="{pdf_url}">Cardápio</a>'
        )
        pdf = network.get(pdf_url).respond(200, content=fixture.read_bytes())
        response = client.get("/restaurant/menu")
        assert response.status_code == 200
        days = response.json()
        assert days[0]["date"] == "2026-09-14"
        assert days[0]["breakfast"] and days[0]["lunch"] and days[0]["dinner"]
        assert client.get("/restaurant/menu").json() == days
        assert page.call_count == pdf.call_count == 1


@pytest.mark.parametrize(
    "name,campus",
    [
        ("Darcy", Campus.DARCY_RIBEIRO),
        ("Gama", Campus.GAMA),
        ("Ceilandia", Campus.CEILANDIA),
        ("Planaltina", Campus.PLANALTINA),
        ("Fazenda", Campus.FAZENDA_AGUA_LIMPA),
    ],
)
def test_campus_simplificado_consulta_o_campus_correto(client, browser, name, campus):
    assert client.get("/restaurant/menu", params={"campus": name}).status_code == 200
    browser.restaurant.get_menu.assert_awaited_once_with(campus)


@pytest.mark.parametrize("name", ["Darcy Ribeiro", "Ceilândia", "Fazenda Água Limpa"])
def test_nomes_antigos_de_campus_nao_sao_aceitos(client, browser, name):
    assert client.get("/restaurant/menu", params={"campus": name}).status_code == 422
    browser.restaurant.get_menu.assert_not_awaited()


@pytest.mark.parametrize(
    "params,expected",
    [
        ({"date": "2026-09-25"}, [25]),
        ({"date": "2026-10-01"}, []),
        ({"start_date": "2026-09-24", "end_date": "2026-09-25"}, [24, 25]),
        ({"start_date": "2026-09-25", "end_date": "2026-09-25"}, [25]),
        ({"start_date": "2026-09-25"}, [25, 26]),
        ({"end_date": "2026-09-25"}, [24, 25]),
    ],
)
def test_filtros_de_datas_preservam_cache_completo(
    client, browser, database, params, expected
):
    browser.restaurant.get_menu.return_value = tuple(
        DAY.model_copy(update={"date": date(2026, 9, day)}) for day in (24, 25, 26)
    )
    for _ in range(2):
        response = client.get("/restaurant/menu", params=params)
        assert response.status_code == 200
        assert [
            date.fromisoformat(item["date"]).day for item in response.json()
        ] == expected
    assert len(client.get("/restaurant/menu").json()) == 3
    with database() as session:
        assert len(session.scalar(select(RestaurantMenu)).days) == 3
    browser.restaurant.get_menu.assert_awaited_once()


@pytest.mark.parametrize(
    "params",
    [
        {"date": "invalida"},
        {"date": "2026-02-30"},
        {"start_date": "2026-09-26", "end_date": "2026-09-25"},
        {"date": "2026-09-25", "start_date": "2026-09-24"},
        {"date": "2026-09-25", "end_date": "2026-09-26"},
    ],
)
def test_filtros_de_data_invalidos_retornam_422(client, browser, params):
    assert client.get("/restaurant/menu", params=params).status_code == 422
    browser.restaurant.get_menu.assert_not_awaited()


def test_refresh_com_data_atualiza_cache_completo(client, browser):
    client.get("/restaurant/menu")
    browser.restaurant.get_menu.return_value = (
        DAY,
        DAY.model_copy(update={"date": date(2026, 9, 26)}),
    )
    response = client.get("/restaurant/menu?refresh=true&date=2026-09-26")
    assert response.status_code == 200
    assert [item["date"] for item in response.json()] == ["2026-09-26"]
    assert len(client.get("/restaurant/menu").json()) == 2
    assert browser.restaurant.get_menu.await_count == 2


@pytest.mark.parametrize("meal", ["breakfast", "lunch", "dinner"])
def test_filtro_de_refeicao_com_data_preserva_cache(client, browser, database, meal):
    complete = DAY.model_copy(update={"breakfast": DAY.lunch, "dinner": DAY.lunch})
    browser.restaurant.get_menu.return_value = (
        complete,
        complete.model_copy(update={"date": date(2026, 9, 26)}),
    )
    for _ in range(2):
        response = client.get(
            "/restaurant/menu", params={"meal": meal, "date": "2026-09-25"}
        )
        assert response.status_code == 200
        assert response.json() == [
            {"date": "2026-09-25", meal: complete.model_dump(mode="json")[meal]}
        ]
    assert len(client.get("/restaurant/menu").json()) == 2
    assert client.get("/restaurant/menu").json()[0] == complete.model_dump(mode="json")
    with database() as session:
        cached = session.scalar(select(RestaurantMenu))
        assert len(cached.days) == 2
        assert cached.days[0] == complete.model_dump(mode="json")
    browser.restaurant.get_menu.assert_awaited_once()


def test_refeicao_ausente_no_intervalo_retorna_null(client, browser):
    response = client.get(
        "/restaurant/menu?meal=dinner&start_date=2026-09-25&end_date=2026-09-26"
    )
    assert response.status_code == 200
    assert response.json() == [{"date": "2026-09-25", "dinner": None}]


def test_refeicao_invalida_retorna_422(client, browser):
    assert client.get("/restaurant/menu?meal=snack").status_code == 422
    browser.restaurant.get_menu.assert_not_awaited()
