from datetime import UTC, datetime, timedelta
from unittest.mock import ANY

import pytest
from sigaa_client.config import SIGAA_BASE_URL
from sqlalchemy import select

from api.cookies import (
    ACCESS_COOKIE_NAME,
    REFRESH_COOKIE_NAME,
    decrypt_cookie,
    encrypt_cookie,
)
from api.db.enums import UserLevel
from api.db.models import Curriculum, User
from api.modules.me.repository import UserRepository

from .helpers import (
    AGORA,
    CREDENCIAIS,
    NO_CACHE,
    PERFIL,
    PERFIL_LIDO,
)


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
        "unit": {"id": 673, "code": "FCTE", "name": "CAMPUS UNB GAMA"},
        "course": {"id": ANY, "name": "ENGENHARIA DE SOFTWARE", "shift": None},
        "entry_semester": "2025.1",
        "integralization": 35,
        "workload": {
            "total": 3525,
            "pending_mandatory": 2175,
            "pending_optional": 420,
            "pending_complementary": 0,
        },
        "period_max_workload": None,
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


def test_troca_de_curso_loga_com_a_matricula_antiga_e_me_responde_o_perfil(
    client, sigaa, database
):
    # O CAS só aceita a matrícula antiga; o perfil já mostra a do curso novo.
    sigaa.profile = PERFIL.replace("<td>251000000</td>", "<td>252000000</td>")
    login = client.post(
        "/auth/sigaa", json={"registration": "251000000", "password": "senha123"}
    )
    assert login.status_code == 200

    response = client.get("/me")
    client.patch("/me/settings", json={"displayName": "Ana"})

    assert response.status_code == 200
    assert response.json()["registration"] == "252000000"
    assert client.get("/me/settings").json() == {"displayName": "Ana"}

    with database() as session:
        users = [
            (u.registration, u.old_registration, u.settings)
            for u in session.scalars(select(User))
        ]
    assert users == [("252000000", "251000000", {"displayName": "Ana"})]


def test_me_sem_campos_opcionais_retorna_null(client, sigaa, cookies):
    client.cookies.update(cookies(refresh=CREDENCIAIS))

    response = client.get("/me")

    assert response.status_code == 200
    for field in (
        "photo",
        "email",
        "bio",
        "entry_semester",
        "integralization",
        "workload",
        "period_max_workload",
        "ira",
        "mp",
    ):
        assert response.json()[field] is None


def test_me_traz_carga_maxima_por_periodo_da_matriz(client, sigaa, database):
    sigaa.profile = PERFIL
    client.post(
        "/auth/sigaa", json={"registration": "251000000", "password": "senha123"}
    )
    with database.begin() as session:
        user = session.scalars(select(User)).one()
        user.curriculum = Curriculum(
            course_id=user.course_id,
            sigaa_id=1,
            code="6360/1",
            valid_from="2025.1",
            created_year=2025,
            active=True,
            matrix="ENGENHARIA DE SOFTWARE",
            period_max_workload=420,
        )

    assert client.get("/me").json()["period_max_workload"] == 420


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
        "unit",
        "course",
        "entry_semester",
        "integralization",
        "workload",
        "period_max_workload",
        "ira",
        "mp",
    } <= fields.keys()
    assert "password" not in fields
    assert "session_token" not in fields


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
    assert user.entry_semester == "2025.1"
    assert user.profile_synced_at is not None


async def test_perfil_assume_o_usuario_sombra_da_mesma_matricula(async_database):
    async with async_database() as session:
        session.add(
            User(
                name="NOME DA LISTA",
                registration="251000000",
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
    assert users[0].email == "discente@example.org"
