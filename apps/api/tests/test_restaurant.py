from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
import respx
from pydantic import SecretStr
from sigaa_client import (
    Credentials,
)
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from unb_browser import Campus, DailyMenu, MenuSection, UnbParseError
from unb_browser.config import RU_MENU_URL

from api.db.models import RestaurantMenu
from api.modules.public_restaurant.repository import RestaurantRepository

CREDENTIALS = Credentials(registration="251000000", password=SecretStr("senha"))
NO_CACHE = {"Cache-Control": "no-cache"}
DAY = DailyMenu(
    date=date(2026, 9, 25),
    lunch=(MenuSection(key="main_dish", name="Prato principal", items=("Frango",)),),
)


def _cached_days(session):
    rows = session.scalars(select(RestaurantMenu).order_by(RestaurantMenu.date))
    return [
        DailyMenu.model_validate(row, from_attributes=True).model_dump(mode="json")
        for row in rows
    ]


@pytest.fixture(autouse=True)
def today(monkeypatch):
    current = SimpleNamespace(value=date(2026, 9, 25))
    monkeypatch.setattr(
        "api.modules.public_restaurant.service.today", lambda: current.value
    )
    return current


@pytest.fixture
def browser(monkeypatch):
    browser = MagicMock()
    browser.__aenter__.return_value = browser
    browser.restaurant.get_menu = AsyncMock(return_value=(DAY,))
    monkeypatch.setattr(
        "api.modules.public_restaurant.service.UnbBrowser", lambda: browser
    )
    return browser


def test_menu_publico_grava_antes_de_responder_e_reutiliza_cache(
    client, browser, database, qstash
):
    response = client.get("/public/restaurant")
    assert response.status_code == 200
    assert response.json() == [DAY.model_dump(mode="json")]
    with database() as session:
        cached = session.scalar(select(RestaurantMenu))
        assert cached.campus == "Darcy Ribeiro"
        assert _cached_days(session) == response.json()
    browser.restaurant.get_menu.side_effect = UnbParseError("fora")
    assert client.get("/public/restaurant").json() == response.json()
    browser.restaurant.get_menu.assert_awaited_once_with(Campus.DARCY_RIBEIRO)
    assert qstash.published == []
    # Resposta do cache não abre o browser.
    assert browser.__aexit__.await_count == 1


def test_menu_cache_separado_por_campus_e_refresh(client, browser, database):
    client.get("/public/restaurant")
    other = DAY.model_copy(update={"lunch": None})
    browser.restaurant.get_menu.return_value = (other,)
    expected = [other.model_dump(mode="json")]
    assert (
        client.get("/public/restaurant", params={"campus": "Gama"}).json() == expected
    )
    assert client.get("/public/restaurant").json() == [DAY.model_dump(mode="json")]
    assert client.get("/public/restaurant", headers=NO_CACHE).json() == expected
    assert client.get("/public/restaurant").json() == expected
    assert browser.restaurant.get_menu.await_count == 3
    with database() as session:
        assert len(list(session.scalars(select(RestaurantMenu)))) == 2


@pytest.mark.parametrize(
    "path",
    [
        "/restaurant/menu",
        "/restaurant/statement",
        "/restaurant/token",
        "/public/restaurant/statement",
        "/public/restaurant/token",
    ],
)
def test_rotas_removidas_ou_privadas_nao_existem_no_cardapio_publico(client, path):
    assert client.get(path).status_code == 404


def test_menu_vazio_nao_fica_em_cache(client, browser, database):
    browser.restaurant.get_menu.return_value = ()
    assert client.get("/public/restaurant").json() == []
    assert client.get("/public/restaurant").json() == []
    assert browser.restaurant.get_menu.await_count == 2
    with database() as session:
        assert session.scalar(select(RestaurantMenu)) is None


def _age_cache(database, hours):
    with database() as session:
        session.execute(
            update(RestaurantMenu).values(
                synced_at=datetime.now(UTC) - timedelta(hours=hours)
            )
        )
        session.commit()


def test_menu_vencido_reconsulta_e_substitui_cache(client, browser, database):
    client.get("/public/restaurant")
    _age_cache(database, 71)
    client.get("/public/restaurant")
    browser.restaurant.get_menu.assert_awaited_once()
    _age_cache(database, 73)
    browser.restaurant.get_menu.return_value = (DAY.model_copy(update={"lunch": None}),)
    response = client.get("/public/restaurant")
    assert response.status_code == 200
    assert response.json()[0]["lunch"] is None
    assert client.get("/public/restaurant").json() == response.json()
    assert browser.restaurant.get_menu.await_count == 2


def test_menu_grava_uma_linha_por_dia_e_atualiza_no_refresh(client, browser, database):
    browser.restaurant.get_menu.return_value = (
        DAY,
        DAY.model_copy(update={"date": date(2026, 9, 26), "breakfast": DAY.lunch}),
    )
    client.get("/public/restaurant")
    with database() as session:
        rows = list(session.scalars(select(RestaurantMenu)))
        assert [row.date for row in rows] == [date(2026, 9, 25), date(2026, 9, 26)]
        assert rows[0].breakfast is None and rows[0].dinner is None
        assert rows[0].lunch == DAY.model_dump(mode="json")["lunch"]
        assert rows[1].breakfast == rows[1].lunch
        first = rows[0].id
    browser.restaurant.get_menu.return_value = (
        DAY.model_copy(update={"lunch": None}),
        DAY.model_copy(update={"date": date(2026, 9, 27)}),
    )
    response = client.get("/public/restaurant", headers=NO_CACHE).json()
    assert [(item["date"], item.get("lunch")) for item in response] == [
        ("2026-09-25", None),
        ("2026-09-26", DAY.model_dump(mode="json")["lunch"]),
        ("2026-09-27", DAY.model_dump(mode="json")["lunch"]),
    ]
    with database() as session:
        assert _cached_days(session) == response
        assert session.get(RestaurantMenu, first).lunch is None


def test_dia_antigo_fora_do_cardapio_nao_vence_o_cache(client, browser, database):
    browser.restaurant.get_menu.return_value = (
        DAY.model_copy(update={"date": date(2026, 9, 24)}),
    )
    client.get("/public/restaurant")
    _age_cache(database, 73)
    browser.restaurant.get_menu.return_value = (DAY,)
    assert len(client.get("/public/restaurant").json()) == 2
    assert len(client.get("/public/restaurant").json()) == 2
    assert browser.restaurant.get_menu.await_count == 2


@pytest.mark.parametrize(
    "error", [UnbParseError("layout mudou"), httpx.ReadTimeout("fora do ar")]
)
def test_ru_fora_do_ar_serve_cache_vencido(client, browser, database, error):
    original = client.get("/public/restaurant").json()
    _age_cache(database, 73)
    browser.restaurant.get_menu.side_effect = error
    response = client.get("/public/restaurant")
    assert response.status_code == 200
    assert response.json() == original
    assert browser.restaurant.get_menu.await_count == 2


def test_ru_fora_do_ar_sem_cache_retorna_502(client, browser):
    browser.restaurant.get_menu.side_effect = UnbParseError("layout mudou")
    assert client.get("/public/restaurant").status_code == 502


def test_ru_fora_do_ar_com_cache_so_de_outras_datas_retorna_502(
    client, browser, database
):
    browser.restaurant.get_menu.return_value = (
        DAY.model_copy(update={"date": date(2026, 9, 18)}),
    )
    client.get("/public/restaurant?date=2026-09-18")
    _age_cache(database, 73)
    browser.restaurant.get_menu.side_effect = UnbParseError("fora")
    assert client.get("/public/restaurant").status_code == 502
    assert client.get("/public/restaurant?date=2026-09-18").status_code == 200


def test_cache_fresco_sem_dias_no_intervalo_sempre_consulta_o_ru(client, browser):
    browser.restaurant.get_menu.return_value = (
        DAY.model_copy(update={"date": date(2026, 9, 18)}),
    )
    client.get("/public/restaurant?date=2026-09-18")
    only_if_cached = {"Cache-Control": "only-if-cached"}
    assert client.get("/public/restaurant", headers=only_if_cached).status_code == 504
    assert client.get("/public/restaurant").json() == []
    assert client.get("/public/restaurant").json() == []
    assert browser.restaurant.get_menu.await_count == 3


def test_cache_le_so_o_intervalo_pedido(client, browser, monkeypatch):
    client.get("/public/restaurant")
    ranges, original = [], RestaurantRepository.get

    async def get(self, campus, start, end):
        ranges.append((start, end))
        return await original(self, campus, start, end)

    monkeypatch.setattr(RestaurantRepository, "get", get)
    client.get("/public/restaurant", params={"start_date": "2026-09-01"})
    client.get("/public/restaurant", params={"end_date": "2026-09-01"})
    client.get("/public/restaurant")
    # Intervalos sem dias no cache são relidos depois de consultar o RU.
    assert list(dict.fromkeys(ranges)) == [
        (date(2026, 9, 1), date(2026, 9, 7)),
        (date(2026, 8, 26), date(2026, 9, 1)),
        (date(2026, 9, 21), date(2026, 9, 27)),
    ]


@pytest.mark.parametrize(
    "params,expected",
    [
        ({}, [21, 27]),
        ({"meal": "lunch"}, [21, 27]),
        ({"start_date": "2026-09-27"}, [27, 28]),
        ({"end_date": "2026-09-21"}, [20, 21]),
        ({"start_date": "2026-09-20"}, [20, 21]),
        ({"end_date": "2026-09-28"}, [27, 28]),
        ({"date": "2026-09-28"}, [28]),
    ],
)
def test_sem_intervalo_retorna_semana_atual(client, browser, params, expected):
    browser.restaurant.get_menu.return_value = tuple(
        DAY.model_copy(update={"date": date(2026, 9, day)}) for day in (20, 21, 27, 28)
    )
    response = client.get("/public/restaurant", params=params)
    assert [
        date.fromisoformat(item["date"]).day for item in response.json()
    ] == expected


def test_semana_atual_segue_o_dia_de_hoje(client, browser, today):
    browser.restaurant.get_menu.return_value = tuple(
        DAY.model_copy(update={"date": date(2026, 9, day)}) for day in (27, 28)
    )
    today.value = date(2026, 9, 28)
    assert [item["date"] for item in client.get("/public/restaurant").json()] == [
        "2026-09-28"
    ]


def test_falha_ao_salvar_mantem_formato_do_cache(client, browser, monkeypatch):
    section = MenuSection(name="Categoria nova", items=("Item",))
    browser.restaurant.get_menu.return_value = (
        DailyMenu(date=DAY.date, lunch=(section,)),
    )
    monkeypatch.setattr(
        RestaurantRepository, "save", AsyncMock(side_effect=SQLAlchemyError("fora"))
    )
    expected = {
        "date": "2026-09-25",
        "lunch": [{"key": None, "name": "Categoria nova", "items": ["Item"]}],
    }
    assert client.get("/public/restaurant?meal=lunch").json() == [expected]
    assert client.get("/public/restaurant").json() == [
        {**expected, "breakfast": None, "dinner": None}
    ]


@pytest.mark.parametrize("method", ["get", "save"])
@pytest.mark.parametrize(
    "error", [SQLAlchemyError("banco indisponível"), OSError("conexão recusada")]
)
def test_falha_do_banco_nao_impede_cardapio(
    client, browser, monkeypatch, method, error
):
    monkeypatch.setattr(RestaurantRepository, method, AsyncMock(side_effect=error))
    response = client.get("/public/restaurant")
    assert response.status_code == 200
    assert response.json() == [DAY.model_dump(mode="json")]


def test_falha_no_commit_preserva_cache_e_retorna_menu_novo(
    client, browser, database, monkeypatch
):
    from sqlalchemy.ext.asyncio import AsyncSession

    original = client.get("/public/restaurant").json()
    browser.restaurant.get_menu.return_value = ()
    monkeypatch.setattr(
        AsyncSession,
        "commit",
        AsyncMock(side_effect=SQLAlchemyError("falha no commit")),
    )
    assert client.get("/public/restaurant", headers=NO_CACHE).json() == []
    with database() as session:
        assert _cached_days(session) == original


def test_conflito_entre_gravacoes_nao_impede_resposta(client, browser, monkeypatch):
    monkeypatch.setattr(
        RestaurantRepository,
        "save",
        AsyncMock(side_effect=IntegrityError("insert", {}, Exception("duplicado"))),
    )
    assert client.get("/public/restaurant").json() == [DAY.model_dump(mode="json")]


def test_menu_em_cache_invalido_e_refeito(client, browser, database):
    client.get("/public/restaurant")
    with database() as session:
        session.execute(update(RestaurantMenu).values(lunch=[{"nome": "inválido"}]))
        session.commit()
    assert client.get("/public/restaurant").json() == [DAY.model_dump(mode="json")]
    assert browser.restaurant.get_menu.await_count == 2


@pytest.mark.parametrize(
    "error", [UnbParseError("layout mudou"), httpx.ReadTimeout("fora do ar")]
)
def test_refresh_com_erro_no_ru_preserva_cache(client, browser, error):
    original = client.get("/public/restaurant").json()
    browser.restaurant.get_menu.side_effect = error
    assert client.get("/public/restaurant", headers=NO_CACHE).status_code == 502
    assert client.get("/public/restaurant").json() == original


def test_menu_informa_a_idade_do_cache(client, browser, database):
    primeira = client.get("/public/restaurant")
    _age_cache(database, 2)

    segunda = client.get("/public/restaurant")

    assert primeira.headers["cache-control"] == "private, no-cache"
    assert int(primeira.headers["age"]) < 5
    assert 7200 <= int(segunda.headers["age"]) < 7205


@pytest.mark.parametrize("max_age,consultas", [(3600, 2), (86400, 1)])
def test_menu_max_age_revalida_cache_mais_velho_que_o_pedido(
    client, browser, database, max_age, consultas
):
    client.get("/public/restaurant")
    _age_cache(database, 2)

    client.get("/public/restaurant", headers={"Cache-Control": f"max-age={max_age}"})

    assert browser.restaurant.get_menu.await_count == consultas


@pytest.mark.parametrize(
    "header,status",
    [("no-cache, stale-if-error", 200), ("no-cache, stale-if-error=60", 502)],
)
def test_menu_stale_if_error_serve_cache_se_o_ru_falhar(
    client, browser, database, header, status
):
    original = client.get("/public/restaurant").json()
    _age_cache(database, 2)
    browser.restaurant.get_menu.side_effect = UnbParseError("layout mudou")

    response = client.get("/public/restaurant", headers={"Cache-Control": header})

    assert response.status_code == status
    if status == 200:
        assert response.json() == original


def test_menu_only_if_cached_nunca_consulta_o_ru(client, browser, database):
    vazio = client.get(
        "/public/restaurant", headers={"Cache-Control": "only-if-cached"}
    )
    original = client.get("/public/restaurant").json()
    _age_cache(database, 73)

    vencido = client.get(
        "/public/restaurant", headers={"Cache-Control": "only-if-cached"}
    )

    assert vazio.status_code == 504
    assert vencido.json() == original
    assert browser.restaurant.get_menu.await_count == 1


def test_menu_rejeita_campus_invalido(client, browser):
    assert client.get("/public/restaurant?campus=inexistente").status_code == 422
    browser.restaurant.get_menu.assert_not_awaited()


def test_openapi_documenta_restaurante(client):
    schema = client.get("/openapi.json").json()
    paths = schema["paths"]
    menu = paths["/public/restaurant"]["get"]
    assert "/restaurant/menu" not in paths
    assert "/restaurant/statement" not in paths
    assert "/restaurant/token" not in paths
    assert menu["tags"] == ["Public Restaurant"]
    assert {p["name"] for p in menu["parameters"]} == {
        "Cache-Control",
        "campus",
        "date",
        "start_date",
        "end_date",
        "meal",
    }
    assert "401" not in menu["responses"]


def test_cardapio_do_pdf_real_chega_ao_endpoint_e_ao_cache(client, today):
    today.value = date(2026, 9, 16)
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
        response = client.get("/public/restaurant")
        assert response.status_code == 200
        days = response.json()
        assert days[0]["date"] == "2026-09-14"
        assert days[0]["breakfast"] and days[0]["lunch"] and days[0]["dinner"]
        assert client.get("/public/restaurant").json() == days
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
    assert client.get("/public/restaurant", params={"campus": name}).status_code == 200
    browser.restaurant.get_menu.assert_awaited_once_with(campus)


@pytest.mark.parametrize("name", ["Darcy Ribeiro", "Ceilândia", "Fazenda Água Limpa"])
def test_nomes_antigos_de_campus_nao_sao_aceitos(client, browser, name):
    assert client.get("/public/restaurant", params={"campus": name}).status_code == 422
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
        response = client.get("/public/restaurant", params=params)
        assert response.status_code == 200
        assert [
            date.fromisoformat(item["date"]).day for item in response.json()
        ] == expected
    assert len(client.get("/public/restaurant").json()) == 3
    with database() as session:
        assert len(_cached_days(session)) == 3
    # Intervalo sem dias no cache não vale: as duas requisições consultam o RU.
    assert browser.restaurant.get_menu.await_count == (1 if expected else 2)


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
    assert client.get("/public/restaurant", params=params).status_code == 422
    browser.restaurant.get_menu.assert_not_awaited()


def test_refresh_com_data_atualiza_cache_completo(client, browser):
    client.get("/public/restaurant")
    browser.restaurant.get_menu.return_value = (
        DAY,
        DAY.model_copy(update={"date": date(2026, 9, 26)}),
    )
    response = client.get("/public/restaurant?date=2026-09-26", headers=NO_CACHE)
    assert response.status_code == 200
    assert [item["date"] for item in response.json()] == ["2026-09-26"]
    assert len(client.get("/public/restaurant").json()) == 2
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
            "/public/restaurant", params={"meal": meal, "date": "2026-09-25"}
        )
        assert response.status_code == 200
        assert response.json() == [
            {"date": "2026-09-25", meal: complete.model_dump(mode="json")[meal]}
        ]
    assert len(client.get("/public/restaurant").json()) == 2
    assert client.get("/public/restaurant").json()[0] == complete.model_dump(
        mode="json"
    )
    with database() as session:
        cached = _cached_days(session)
        assert len(cached) == 2
        assert cached[0] == complete.model_dump(mode="json")
    browser.restaurant.get_menu.assert_awaited_once()


def test_refeicao_ausente_no_intervalo_retorna_null(client, browser):
    response = client.get(
        "/public/restaurant?meal=dinner&start_date=2026-09-25&end_date=2026-09-26"
    )
    assert response.status_code == 200
    assert response.json() == [{"date": "2026-09-25", "dinner": None}]


def test_refeicao_invalida_retorna_422(client, browser):
    assert client.get("/public/restaurant?meal=snack").status_code == 422
    browser.restaurant.get_menu.assert_not_awaited()
