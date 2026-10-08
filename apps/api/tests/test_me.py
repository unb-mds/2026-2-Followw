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
    CurriculumWorkload,
    RestaurantCredentials,
    RestaurantStatement,
    RestaurantStatementEntry,
    SessionExpired,
    SigaaParseError,
    UserProfile,
)
from sigaa_client import UserLevel as SigaaUserLevel
from sigaa_client.config import SIGAA_BASE_URL
from sqlalchemy import select

from api.cookies import (
    ACCESS_COOKIE_NAME,
    REFRESH_COOKIE_NAME,
    decrypt_cookie,
    encrypt_cookie,
)
from api.db.enums import UserLevel
from api.db.main import get_sessionmaker
from api.db.models import User
from api.modules.me.repository import UserRepository

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
    <tr><td colspan="2"><table>
      <tr><td> CH. Obrigat&#243;ria Pendente </td><td> 2175 </td></tr>
      <tr><td> CH. Optativa Pendente </td><td> 420 </td></tr>
      <tr><td> CH. Total Curr&#237;culo </td><td> 3525 </td></tr>
      <tr><td> CH. Complementar Pendente </td><td> 0 </td></tr>
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
        "workload": {
            "total": 3525,
            "pending_mandatory": 2175,
            "pending_optional": 420,
            "pending_complementary": 0,
        },
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
    # Só a sessão do usuário segue aberta: a do sync da conta foi encerrada.
    assert sigaa.logins - sigaa.logouts == 1


def test_me_sem_campos_opcionais_retorna_null(client, sigaa, cookies):
    client.cookies.update(cookies(refresh=CREDENCIAIS))

    response = client.get("/me")

    assert response.status_code == 200
    for field in ("photo", "email", "bio", "integralization", "workload", "ira", "mp"):
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
        "workload",
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

    with respx.mock as network:
        network.route(
            host="sigaa.unb.br", path="/sigaa/portais/discente/discente.jsf"
        ).mock(side_effect=dashboard)
        for amount in ("49,50", "51,00", "40,00"):
            response = client.get("/me/ru-statement")
            assert response.status_code == 200
            assert response.headers["cache-control"] == "no-store"
            assert response.json()["balance"] == amount.replace(",", ".")
            assert response.json()["group"] == 3
            assert len(response.json()["entries"]) == 3
            assert response.json()["entries"][1]["amount"] == "-4.50"
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
    assert schema["components"]["schemas"]["RestaurantStatement"]["properties"][
        "group"
    ]["anyOf"][0]["enum"] == [1, 2, 3, 4]


def test_configuracoes_aceitam_display_name_no_limite(client, cookies):
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    nome = "a" * 24

    response = client.patch("/me/settings", json={"displayName": nome})

    assert response.status_code == 200
    assert response.json() == {"displayName": nome}
    assert client.get("/me/settings").json() == response.json()


def test_patch_sem_campos_preserva_as_configuracoes(client, cookies):
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    client.patch("/me/settings", json={"displayName": "Ana"})

    response = client.patch("/me/settings", json={})

    assert response.json() == {"displayName": "Ana"}


@pytest.mark.parametrize(
    "body",
    [
        {"displayName": "a" * 25},
        {"displayName": ""},
        {"displayName": "   "},
        # A setting saiu: quem ainda a mandar recebe 422.
        {"defaultRuCampus": "Gama"},
        {"theme": "dark"},
    ],
)
def test_configuracoes_rejeitam_input_invalido(client, cookies, body):
    client.cookies.update(cookies(refresh=CREDENCIAIS))

    response = client.patch("/me/settings", json=body)

    assert response.status_code == 422
    assert client.get("/me/settings").json() == {"displayName": None}


def test_configuracoes_removem_espacos_do_display_name(client, cookies):
    client.cookies.update(cookies(refresh=CREDENCIAIS))

    response = client.patch("/me/settings", json={"displayName": "  Ana  "})

    assert response.json()["displayName"] == "Ana"


def test_configuracoes_sobrevivem_ao_sync_criando_o_usuario_ao_mesmo_tempo(
    client, cookies, monkeypatch
):
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    client.patch("/me/settings", json={"displayName": "Ana"})
    original = UserRepository.get_by_registration
    calls = 0

    # Simula o sync do perfil gravando o usuário entre a leitura e o insert.
    async def get_by_registration(self, registration):
        nonlocal calls
        calls += 1
        return None if calls == 1 else await original(self, registration)

    monkeypatch.setattr(UserRepository, "get_by_registration", get_by_registration)

    response = client.patch("/me/settings", json={"displayName": "Bia"})

    assert response.status_code == 200
    assert response.json() == {"displayName": "Bia"}


AGORA = datetime(2026, 9, 22, tzinfo=UTC)
PERFIL_LIDO = UserProfile(
    name="NOME DISCENTE",
    registration="251000000",
    photo=None,
    bio="Bio.",
    unity="FCTE",
    course="ENGENHARIA DE SOFTWARE",
    integralization=35,
    workload=CurriculumWorkload(
        total=3525,
        pending_mandatory=2175,
        pending_optional=420,
        pending_complementary=0,
    ),
    ira=3.9,
    mp=4.1,
    level=SigaaUserLevel.GRADUACAO,
)


@pytest.mark.parametrize(
    "registration", ["251000000", "251000001", "inexistente", "' OR 1=1 --"]
)
async def test_repository_busca_somente_a_matricula_pedida(
    async_database, registration
):
    async with async_database() as session:
        session.add_all(
            User(
                name=f"Discente {index}",
                registration=f"25100000{index}",
                level=UserLevel.GRADUACAO,
            )
            for index in range(2)
        )
        await session.commit()

        result = await UserRepository(session).get_by_registration(registration)

    assert (result.registration if result else None) == (
        registration if registration.startswith("25100000") else None
    )


async def test_perfil_cria_usuario_com_data_de_sync(async_database):
    async with async_database() as session:
        await UserRepository(session).save_profile(PERFIL_LIDO, AGORA)
        await session.commit()

    async with async_database() as session:
        user = await UserRepository(session).get_by_registration("251000000")

    assert user is not None
    assert (user.name, user.ira, user.level) == (
        "NOME DISCENTE",
        3.9,
        UserLevel.GRADUACAO,
    )
    assert user.workload == PERFIL_LIDO.workload.model_dump()
    assert user.profile_synced_at is not None


async def test_perfil_assume_o_usuario_sombra_da_mesma_matricula(async_database):
    async with async_database() as session:
        session.add(
            User(
                name="NOME DA LISTA",
                registration="251000000",
                person_id=42,
                email="discente@example.org",
            )
        )
        await session.commit()

        await UserRepository(session).save_profile(PERFIL_LIDO, AGORA)
        await session.commit()

    async with async_database() as session:
        users = list(await session.scalars(select(User)))

    assert len(users) == 1
    assert users[0].name == "NOME DISCENTE"
    # O perfil não traz esses campos: o que a lista de participantes trouxe fica.
    assert (users[0].person_id, users[0].email) == (42, "discente@example.org")


async def test_settings_retorna_vazio_quando_usuario_nao_tem_configuracoes(
    async_database,
):
    async with async_database() as session:
        settings = await UserRepository(session).get_settings("251000000")
        assert settings == {}


async def test_settings_salva_e_sobrescreve_preferencias(async_database):
    async with async_database() as session:
        repo = UserRepository(session)
        updated = await repo.update_settings(
            "251000000", {"displayName": "Discente Teste"}
        )
        assert updated == {"displayName": "Discente Teste"}
        await session.commit()

    async with async_database() as session:
        repo = UserRepository(session)
        updated = await repo.update_settings("251000000", {"displayName": "Outro"})
        assert updated == {"displayName": "Outro"}
        await session.commit()

    async with async_database() as session:
        repo = UserRepository(session)
        settings = await repo.get_settings("251000000")
        assert settings == {"displayName": "Outro"}
