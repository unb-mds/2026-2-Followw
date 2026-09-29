from datetime import UTC, date, datetime, timedelta
from unittest.mock import AsyncMock, call

import pytest
from pydantic import SecretStr
from sigaa_client import (
    AttendanceEntry,
    AttendanceStatus,
    Classroom,
    ClassroomAttendance,
    ClassroomFrequency,
    ClassroomMember,
    ClassroomNotFound,
    ClassroomProgress,
    ClassroomRole,
    Credentials,
    SessionExpired,
    SigaaError,
    SigaaParseError,
    StatisticsShare,
    StudentSituation,
    Subject,
)
from sqlalchemy import select, update

from api.db.models import Classroom as ClassroomModel
from api.db.models import ClassroomFrequencyCache, ClassroomUser, User
from api.dependencies.qstash import decode_job
from api.services.sync import Task
from api.utils.session import (
    ACCESS_COOKIE_NAME,
    REFRESH_COOKIE_NAME,
    encrypt_cookie,
)

CREDENCIAIS = Credentials(registration="251000000", password=SecretStr("senha123"))
NO_CACHE = {"Cache-Control": "no-cache"}
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
        "/auth/sigaa", json={"registration": "251000000", "password": "senha123"}
    )
    assert login.status_code == 200
    requests_before = classrooms_sigaa.classrooms_requests

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
            "current": True,
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
    # O login já sincronizou as turmas: a listagem sai do cache.
    assert classrooms_sigaa.classrooms_requests == requests_before
    assert client.get("/me").status_code == 200


def test_refresh_reflete_alteracoes_no_sigaa(client, classrooms_sigaa, cookies):
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    assert client.get("/classrooms").json()[0]["room"] == "MOCAP"
    classrooms_sigaa.profile = classrooms_sigaa.profile.replace("MOCAP", "SALA 02")
    assert client.get("/classrooms").json()[0]["room"] == "MOCAP"

    response = client.get("/classrooms", headers=NO_CACHE)

    assert response.status_code == 200
    assert response.json()[0]["room"] == "SALA 02"
    assert client.get("/classrooms").json()[0]["room"] == "SALA 02"
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
        refresh = encrypt_cookie(
            REFRESH_COOKIE_NAME,
            {
                "registration": "251000000",
                "password": "senha123",
                "exp": int((datetime.now(UTC) - timedelta(minutes=1)).timestamp()),
            },
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
    client.post(
        "/auth/sigaa", json={"registration": "251000000", "password": "senha123"}
    )
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
    client, classrooms_sigaa, cookies, database, semester, expected
):
    # Com o perfil já no cache, gravar as turmas não precisa buscá-lo.
    with database() as session:
        session.add(
            User(
                name="NOME DISCENTE",
                registration=CREDENCIAIS.registration,
                profile_synced_at=datetime.now(UTC),
            )
        )
        session.commit()
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
        "current": False,
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


ATUAL = Classroom(
    id="AAA",
    number="01",
    semester="2026.2",
    current=True,
    subject=Subject(code="FGA0146", name="ESTRUTURAS DE DADOS 1"),
)
ANTIGA = Classroom(
    id="BBB",
    number="02",
    semester="2025.2",
    subject=Subject(code="FGA0158", name="ORIENTAÇÃO A OBJETOS"),
)
PARTICIPANTES = [
    ClassroomMember(name="ZECA", role=ClassroomRole.ALUNO, registration="2"),
    ClassroomMember(name="NOME DOCENTE", role=ClassroomRole.PROFESSOR),
    ClassroomMember(name="ANA", role=ClassroomRole.ALUNO, registration="3"),
]


@pytest.fixture
def turmas(stub_sigaa):
    stub_sigaa.classrooms.list_classrooms.return_value = [ATUAL, ANTIGA]
    stub_sigaa.classrooms.list_classroom_members.return_value = PARTICIPANTES
    stub_sigaa.classrooms.get_classroom_statistics.return_value = (
        StatisticsShare(situation=StudentSituation.MATRICULADO, percentage=10),
        StatisticsShare(situation=StudentSituation.APROVADO, percentage=90),
    )
    return stub_sigaa


def test_participantes_saem_do_cache_do_login(client, sigaa, turmas):
    client.post(
        "/auth/sigaa", json={"registration": "251000000", "password": "senha123"}
    )
    lidas = turmas.classrooms.list_classroom_members.await_count

    response = client.get("/classrooms/AAA/members")

    assert response.status_code == 200
    # Docentes primeiro, depois discentes em ordem alfabética.
    assert [m["name"] for m in response.json()] == ["NOME DOCENTE", "ANA", "ZECA"]
    assert response.json()[1]["registration"] == "3"
    assert turmas.classrooms.list_classroom_members.await_count == lidas


def test_participantes_sem_cache_buscam_as_turmas_antes(client, turmas, cookies):
    client.cookies.update(cookies(refresh=CREDENCIAIS))

    primeira = client.get("/classrooms/BBB/members")
    segunda = client.get("/classrooms/BBB/members")

    assert primeira.status_code == segunda.status_code == 200
    assert primeira.json() == segunda.json()
    assert turmas.classrooms.list_classrooms.await_count == 1
    assert turmas.classrooms.list_classroom_members.await_count == 1


def test_turma_fora_da_lista_do_usuario_retorna_404(client, turmas, cookies):
    client.cookies.update(cookies(refresh=CREDENCIAIS))

    for screen in ("members", "statistics"):
        response = client.get(f"/classrooms/DE-OUTRO-ALUNO/{screen}")
        assert response.status_code == 404
    turmas.classrooms.list_classroom_members.assert_not_awaited()


def test_turma_nova_fora_do_cache_rele_a_lista(client, sigaa, turmas):
    client.post(
        "/auth/sigaa", json={"registration": "251000000", "password": "senha123"}
    )
    nova = ATUAL.model_copy(update={"id": "CCC", "number": "02"})
    turmas.classrooms.list_classrooms.return_value = [ATUAL, nova, ANTIGA]

    response = client.get("/classrooms/CCC/members")

    assert response.status_code == 200
    assert turmas.classrooms.list_classrooms.await_count == 2
    assert turmas.classrooms.list_classroom_members.await_args.args == ("CCC",)


def test_detalhes_de_turma_passada_nunca_revalidam(client, sigaa, turmas, database):
    client.post(
        "/auth/sigaa", json={"registration": "251000000", "password": "senha123"}
    )
    with database() as session:
        session.execute(
            update(ClassroomModel).values(
                members_synced_at=datetime.now(UTC) - timedelta(days=365)
            )
        )
        session.commit()

    client.get("/classrooms/BBB/members")
    assert turmas.classrooms.list_classroom_members.await_count == 2
    client.get("/classrooms/AAA/members")
    assert turmas.classrooms.list_classroom_members.await_count == 3


def test_refresh_dos_participantes_busca_no_sigaa(client, sigaa, turmas):
    client.post(
        "/auth/sigaa", json={"registration": "251000000", "password": "senha123"}
    )
    turmas.classrooms.list_classroom_members.return_value = PARTICIPANTES[:1]

    response = client.get("/classrooms/AAA/members", headers=NO_CACHE)

    assert [m["name"] for m in response.json()] == ["ZECA"]
    assert [m["name"] for m in client.get("/classrooms/AAA/members").json()] == ["ZECA"]


def test_estatisticas_na_ordem_da_legenda(client, turmas, cookies):
    client.cookies.update(cookies(refresh=CREDENCIAIS))

    primeira = client.get("/classrooms/AAA/statistics")
    segunda = client.get("/classrooms/AAA/statistics")

    assert primeira.status_code == 200
    assert (
        primeira.json()
        == segunda.json()
        == [
            {"situation": "aprovado", "percentage": 90.0},
            {"situation": "matriculado", "percentage": 10.0},
        ]
    )
    assert turmas.classrooms.get_classroom_statistics.await_count == 1


def test_detalhes_com_sigaa_fora_retornam_502(client, turmas, cookies):
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    turmas.classrooms.get_classroom_statistics.side_effect = SigaaError("fora")

    assert client.get("/classrooms/AAA/statistics").status_code == 502


def test_openapi_documenta_participantes_e_estatisticas(client):
    paths = client.get("/openapi.json").json()["paths"]

    for screen in ("members", "statistics"):
        route = paths[f"/classrooms/{{classroom_id}}/{screen}"]["get"]
        assert {"401", "404", "502"} <= route["responses"].keys()
        assert any(p["name"] == "Cache-Control" for p in route["parameters"])


def test_refresh_atualiza_turmas_antigas(client, sigaa, turmas):
    client.post(
        "/auth/sigaa", json={"registration": "251000000", "password": "senha123"}
    )
    antiga = ANTIGA.model_copy(update={"schedule": "24T45", "room": "SALA 07"})
    turmas.classrooms.list_classrooms.return_value = [ATUAL, antiga]

    response = client.get("/classrooms?semester=2025.2", headers=NO_CACHE)

    assert response.json()[0]["schedule"] == "24T45"
    assert response.json()[0]["room"] == "SALA 07"
    assert client.get("/classrooms?semester=2025.2").json() == response.json()


@pytest.mark.parametrize("screen", ["members", "statistics"])
def test_detalhes_revalidam_a_lista_de_turmas_vencida(
    client, sigaa, turmas, database, screen
):
    client.post(
        "/auth/sigaa", json={"registration": "251000000", "password": "senha123"}
    )
    with database() as session:
        session.execute(
            update(User).values(
                classrooms_synced_at=datetime.now(UTC) - timedelta(days=4)
            )
        )
        session.commit()
    # A turma foi trancada: o acesso a ela some depois da revalidação.
    turmas.classrooms.list_classrooms.return_value = [ANTIGA]

    assert client.get(f"/classrooms/AAA/{screen}").status_code == 200
    assert turmas.classrooms.list_classrooms.await_count == 2
    assert client.get(f"/classrooms/AAA/{screen}").status_code == 404


@pytest.mark.parametrize("screen", ["members", "statistics"])
def test_detalhes_aceitam_sigaa_id(client, turmas, cookies, screen):
    turmas.classrooms.list_classrooms.return_value = [
        ATUAL.model_copy(update={"sigaa_id": 1614100})
    ]
    client.cookies.update(cookies(refresh=CREDENCIAIS))

    por_sigaa_id = client.get(f"/classrooms/1614100/{screen}")

    assert por_sigaa_id.status_code == 200
    assert client.get(f"/classrooms/AAA/{screen}").json() == por_sigaa_id.json()
    assert turmas.classrooms.list_classrooms.await_count == 1


CURRENT = Classroom(
    id="HASH-A",
    sigaa_id=1614141,
    number="12",
    semester="2026.2",
    current=True,
    subject=Subject(code="MAT0027", name="CÁLCULO 3", hours=90),
)
SECOND = Classroom(
    id="HASH-B",
    sigaa_id=1614142,
    number="01",
    semester="2026.2",
    current=True,
    subject=Subject(code="FGA0001", name="PROGRAMAÇÃO", hours=60),
)
OLD = Classroom(
    id="HASH-OLD",
    number="01",
    semester="2025.2",
    subject=Subject(code="MAT0001", name="CÁLCULO 1", hours=90),
)
FREQUENCY = ClassroomFrequency(
    progress=ClassroomProgress(taught=30, total=90, percentage=33),
    frequency=ClassroomAttendance(
        entries=(
            AttendanceEntry(
                occurred_on=date(2026, 9, 20), status=AttendanceStatus.PRESENTE
            ),
            AttendanceEntry(
                occurred_on=date(2026, 9, 22), status=AttendanceStatus.FALTA, absences=2
            ),
            AttendanceEntry(
                occurred_on=date(2026, 9, 24), status=AttendanceStatus.NAO_REGISTRADA
            ),
        ),
        attended=28,
        registered=30,
        registered_percentage=93,
        total=90,
        total_percentage=31,
    ),
)
NOT_REGISTERED = ClassroomFrequency(progress=FREQUENCY.progress)


@pytest.fixture
def account(stub_sigaa):
    stub_sigaa.classrooms.list_classrooms.return_value = [SECOND, OLD, CURRENT]
    stub_sigaa.classrooms.get_classroom_frequency = AsyncMock(return_value=FREQUENCY)
    return stub_sigaa


@pytest.fixture
def logged(client, cookies):
    client.cookies.update(cookies(access="tok", refresh=CREDENCIAIS))
    return client


def age_cache(database, *, days=2):
    with database() as session:
        session.execute(
            update(ClassroomFrequencyCache).values(
                synced_at=datetime.now(UTC) - timedelta(days=days)
            )
        )
        session.commit()


def test_ids_numerico_e_hash_retornam_todos_os_campos_e_usam_o_mesmo_cache(
    logged, account, database, qstash
):
    for identifier in ("1614141", "HASH-A", "1614141"):
        response = logged.get(f"/classrooms/{identifier}/frequency")
        assert response.status_code == 200
        assert response.json() == FREQUENCY.model_dump(mode="json")
        assert response.headers["cache-control"] == "private, no-cache"
    account.classrooms.get_classroom_frequency.assert_awaited_once_with("HASH-A")
    assert qstash.published == []
    with database() as session:
        rows = list(session.scalars(select(ClassroomFrequencyCache)))
        assert len(rows) == 1
        assert rows[0].data == FREQUENCY.model_dump(mode="json")


def test_agregado_retorna_apenas_atuais_identificadas_em_ordem_e_reutiliza_cache(
    logged, account
):
    account.classrooms.get_classroom_frequency.side_effect = [FREQUENCY, NOT_REGISTERED]
    response = logged.get("/classrooms/frequency")
    assert response.status_code == 200
    assert response.json() == [
        {
            "classroom": CURRENT.model_dump(mode="json"),
            **FREQUENCY.model_dump(mode="json"),
        },
        {
            "classroom": SECOND.model_dump(mode="json"),
            **NOT_REGISTERED.model_dump(mode="json"),
        },
    ]
    assert account.classrooms.get_classroom_frequency.await_args_list == [
        call("HASH-A"),
        call("HASH-B"),
    ]
    assert account.classrooms.list_classrooms.await_count == 1
    assert logged.get("/classrooms/frequency").json() == response.json()
    assert account.classrooms.get_classroom_frequency.await_count == 2


def test_frequencia_sem_turmas_atuais_retorna_lista_vazia(logged, account):
    account.classrooms.list_classrooms.return_value = [OLD]
    assert logged.get("/classrooms/frequency").json() == []
    account.classrooms.get_classroom_frequency.assert_not_awaited()


def test_sem_lancamentos_preserva_progress_e_cache(logged, account):
    account.classrooms.get_classroom_frequency.return_value = NOT_REGISTERED
    for _ in range(2):
        response = logged.get("/classrooms/HASH-A/frequency")
        assert response.status_code == 200
        assert response.json() == NOT_REGISTERED.model_dump(mode="json")
    account.classrooms.get_classroom_frequency.assert_awaited_once()


def test_refresh_reconsulta_sigaa_e_atualiza_mesmo_cache(logged, account):
    logged.get("/classrooms/HASH-A/frequency")
    account.classrooms.get_classroom_frequency.return_value = NOT_REGISTERED
    assert logged.get(
        "/classrooms/1614141/frequency", headers=NO_CACHE
    ).json() == NOT_REGISTERED.model_dump(mode="json")
    assert logged.get(
        "/classrooms/HASH-A/frequency"
    ).json() == NOT_REGISTERED.model_dump(mode="json")
    assert account.classrooms.get_classroom_frequency.await_count == 2


def test_refresh_agregado_atualiza_lista_e_so_consulta_turmas_que_continuam_ativas(
    logged, account
):
    logged.get("/classrooms/frequency")
    account.classrooms.list_classrooms.return_value = [OLD, SECOND]
    account.classrooms.get_classroom_frequency.reset_mock()
    response = logged.get("/classrooms/frequency", headers=NO_CACHE)
    assert response.status_code == 200
    assert [item["classroom"]["id"] for item in response.json()] == ["HASH-B"]
    account.classrooms.get_classroom_frequency.assert_awaited_once_with("HASH-B")
    assert account.classrooms.list_classrooms.await_count == 2


def test_cache_vencido_revalida_por_job_do_aluno_e_turma(
    logged, account, database, qstash
):
    logged.get("/classrooms/HASH-A/frequency")
    age_cache(database)
    account.classrooms.get_classroom_frequency.return_value = NOT_REGISTERED
    assert logged.get("/classrooms/1614141/frequency").json() == FREQUENCY.model_dump(
        mode="json"
    )
    assert logged.get(
        "/classrooms/HASH-A/frequency"
    ).json() == NOT_REGISTERED.model_dump(mode="json")
    jobs = [decode_job(item["body"].encode()) for item in qstash.published]
    assert [(j.task, j.registration, j.classroom_id) for j in jobs] == [
        (Task.FREQUENCY, CREDENCIAIS.registration, "HASH-A")
    ]


def test_frequencia_de_semestre_passado_por_hash_nao_vence(logged, account, database):
    logged.get("/classrooms/HASH-OLD/frequency")
    age_cache(database, days=365)
    assert logged.get("/classrooms/HASH-OLD/frequency").json() == FREQUENCY.model_dump(
        mode="json"
    )
    account.classrooms.get_classroom_frequency.assert_awaited_once_with("HASH-OLD")


def test_cache_invalido_e_refeito(logged, account, database):
    logged.get("/classrooms/HASH-A/frequency")
    with database() as session:
        session.execute(update(ClassroomFrequencyCache).values(data={}))
        session.commit()
    assert logged.get("/classrooms/HASH-A/frequency").json() == FREQUENCY.model_dump(
        mode="json"
    )
    assert account.classrooms.get_classroom_frequency.await_count == 2


def test_cache_antigo_ganha_estado_e_resumo_sem_nova_consulta(
    logged, account, database
):
    logged.get("/classrooms/HASH-A/frequency")
    data = FREQUENCY.model_dump(mode="json")
    data.pop("frequency_status")
    data["frequency"].pop("summary")
    with database() as session:
        session.execute(update(ClassroomFrequencyCache).values(data=data))
        session.commit()
    response = logged.get("/classrooms/HASH-A/frequency")
    assert response.status_code == 200
    assert response.json()["frequency_status"] == "partially_registered"
    assert response.json()["frequency"]["summary"] == {
        "total_entries": 3,
        "recorded_entries": 2,
        "unrecorded_entries": 1,
        "absence_entries": 1,
        "total_absences": 2,
    }
    assert response.json()["frequency"]["registered"] == 30
    account.classrooms.get_classroom_frequency.assert_awaited_once()


def test_agregado_explicita_ausencia_sem_inventar_saldo_de_faltas(logged, account):
    account.classrooms.get_classroom_frequency.return_value = NOT_REGISTERED
    response = logged.get("/classrooms/frequency")
    assert response.status_code == 200
    for item in response.json():
        assert item["frequency_status"] == "not_registered"
        assert item["frequency"] is None
        assert item["progress"] == NOT_REGISTERED.progress.model_dump()
        assert item["classroom"]["subject"]["sigaa_id"] is None
        assert item["classroom"]["sigaa_id"] is not None


def test_dois_alunos_na_mesma_turma_nao_compartilham_frequencia(
    logged, account, cookies, database
):
    logged.get("/classrooms/1614141/frequency")
    other = Credentials(registration="252000000", password=SecretStr("outra"))
    logged.cookies.clear()
    logged.cookies.update(cookies(access="other-token", refresh=other))
    account.profile.get_profile.return_value = (
        account.profile.get_profile.return_value.model_copy(
            update={"registration": other.registration}
        )
    )
    account.classrooms.get_classroom_frequency.return_value = NOT_REGISTERED
    assert logged.get(
        "/classrooms/1614141/frequency"
    ).json() == NOT_REGISTERED.model_dump(mode="json")
    with database() as session:
        rows = list(session.scalars(select(ClassroomFrequencyCache)))
        assert len(rows) == 2
        assert len({row.user_classroom_id for row in rows}) == 2
    logged.cookies.clear()
    logged.cookies.update(cookies(access="tok", refresh=CREDENCIAIS))
    assert logged.get("/classrooms/1614141/frequency").json() == FREQUENCY.model_dump(
        mode="json"
    )
    assert account.classrooms.get_classroom_frequency.await_count == 2


def test_id_numerico_de_turma_de_outro_aluno_nao_da_acesso(logged, account, cookies):
    logged.get("/classrooms/1614141/frequency")
    other = Credentials(registration="252000000", password=SecretStr("outra"))
    logged.cookies.clear()
    logged.cookies.update(cookies(access="other-token", refresh=other))
    account.profile.get_profile.return_value = (
        account.profile.get_profile.return_value.model_copy(
            update={"registration": other.registration}
        )
    )
    account.classrooms.list_classrooms.return_value = [SECOND]
    account.classrooms.get_classroom_frequency.reset_mock()
    assert logged.get("/classrooms/1614141/frequency").status_code == 404
    account.classrooms.get_classroom_frequency.assert_not_awaited()


@pytest.mark.parametrize("identifier", ["UNKNOWN", "999999", "9" * 100, "0", "-1"])
def test_frequencia_de_turma_nao_encontrada_retorna_404(logged, account, identifier):
    assert logged.get(f"/classrooms/{identifier}/frequency").status_code == 404
    account.classrooms.get_classroom_frequency.assert_not_awaited()


@pytest.mark.parametrize(
    "path", ["/classrooms/frequency", "/classrooms/HASH-A/frequency"]
)
def test_frequencia_exige_autenticacao(client, account, path):
    assert client.get(path).status_code == 401
    account.created.assert_not_called()


@pytest.mark.parametrize(
    "error,status",
    [
        (SessionExpired(), 401),
        (SigaaParseError("fora"), 502),
        (ClassroomNotFound(), 404),
    ],
)
def test_erros_de_consulta_nao_viram_frequencia_vazia(logged, account, error, status):
    account.classrooms.get_classroom_frequency.side_effect = error
    assert logged.get("/classrooms/HASH-A/frequency").status_code == status


@pytest.mark.parametrize(
    "error,status",
    [
        (SessionExpired(), 401),
        (ClassroomNotFound(), 404),
        (SigaaParseError("fora"), 200),
    ],
)
def test_stale_if_error_so_cobre_falha_da_origem(logged, account, error, status):
    logged.get("/classrooms/HASH-A/frequency")
    account.classrooms.get_classroom_frequency.side_effect = error

    response = logged.get(
        "/classrooms/HASH-A/frequency",
        headers={"Cache-Control": "no-cache, stale-if-error"},
    )

    assert response.status_code == status


def test_agregado_nao_omite_turma_com_erro(logged, account):
    account.classrooms.get_classroom_frequency.side_effect = [
        FREQUENCY,
        SigaaParseError("fora"),
    ]
    response = logged.get("/classrooms/frequency")
    assert response.status_code == 502


def test_falha_de_refresh_preserva_cache_anterior(logged, account):
    logged.get("/classrooms/HASH-A/frequency")
    account.classrooms.get_classroom_frequency.side_effect = SigaaParseError("fora")
    assert (
        logged.get("/classrooms/HASH-A/frequency", headers=NO_CACHE).status_code == 502
    )
    assert logged.get("/classrooms/HASH-A/frequency").json() == FREQUENCY.model_dump(
        mode="json"
    )


def test_remover_vinculo_remove_cache_individual(logged, account, database):
    logged.get("/classrooms/HASH-A/frequency")
    account.classrooms.list_classrooms.return_value = [SECOND]
    logged.get("/classrooms", headers=NO_CACHE)
    with database() as session:
        assert session.scalar(select(ClassroomFrequencyCache)) is None
        assert (
            session.scalar(
                select(ClassroomUser).where(ClassroomUser.front_end_id == "HASH-A")
            )
            is None
        )


def test_openapi_documenta_frequencia_individual_e_agregada(client):
    paths = client.get("/openapi.json").json()["paths"]
    for path in ("/classrooms/frequency", "/classrooms/{classroom_id}/frequency"):
        route = paths[path]["get"]
        assert {"401", "404", "502", "503"} <= route["responses"].keys()
        assert any(p["name"] == "Cache-Control" for p in route["parameters"])
