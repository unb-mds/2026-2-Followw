from datetime import UTC, date, datetime, timedelta
from unittest.mock import AsyncMock, call
from uuid import UUID

import pytest
import sigaa_client
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
    FrequencyStatus,
    Grade,
    SessionExpired,
    SigaaError,
    SigaaParseError,
    StatisticsShare,
    StudentSituation,
    Subject,
)
from sqlalchemy import event, func, select, update
from sqlalchemy.exc import IntegrityError

from api.cookies import (
    ACCESS_COOKIE_NAME,
    REFRESH_COOKIE_NAME,
    encrypt_cookie,
)
from api.db.enums import (
    ClassroomStatus,
    LessonMarkStatus,
    UserLevel,
)
from api.db.models import Classroom as ClassroomModel
from api.db.models import (
    ClassroomFrequencyCache,
    ClassroomStatistic,
    ClassroomUser,
    LessonMark,
    User,
)
from api.db.models import Subject as SubjectModel
from api.modules.classrooms.frequency import ClassroomFrequencyView, sync_frequency
from api.modules.classrooms.lessons import (
    FrequencyTotals,
    LessonStatus,
    Timetable,
    build_lessons,
    class_days,
    frequency_totals,
    max_absences,
)
from api.modules.classrooms.repository import ClassroomRepository
from api.sync.engine import Step

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
            "grade": None,
        }
    ]
    # Só a sessão do usuário segue aberta: cada job encerrou a sua.
    assert classrooms_sigaa.logins - classrooms_sigaa.logouts == 1
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
    assert response_schema["items"]["$ref"] == "#/components/schemas/UserClassroom"
    assert {"number", "semester", "schedule", "room", "subject", "grade"} <= schema[
        "components"
    ]["schemas"]["UserClassroom"]["properties"].keys()
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
        "grade": None,
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


def _participantes_sincronizados_em(database, synced_at: datetime) -> None:
    with database() as session:
        session.execute(update(ClassroomModel).values(members_synced_at=synced_at))
        session.commit()


# 2026.2 termina em 18/12: com a tolerância, a lista congela no sync a partir de 22/12.
def test_participantes_fazem_um_ultimo_sync_depois_da_tolerancia_do_semestre(
    client, sigaa, turmas, database, hoje
):
    synced_at = datetime(2026, 9, 22, tzinfo=UTC)
    login = {"registration": "251000000", "password": "senha123"}
    client.post("/auth/sigaa", json=login)
    hoje(date(2026, 12, 22))
    _participantes_sincronizados_em(database, synced_at)
    lidas = turmas.classrooms.list_classroom_members.await_count

    # Servida do cache, a lista vence mesmo sem TTL e revalida por job.
    assert client.get("/classrooms/AAA/members").status_code == 200
    assert turmas.classrooms.list_classroom_members.await_count == lidas + 1

    _participantes_sincronizados_em(database, synced_at)
    client.post("/auth/sigaa", json=login)
    assert turmas.classrooms.list_classroom_members.await_count == lidas + 2


def test_participantes_nao_ressincronizam_depois_do_ultimo_sync(
    client, sigaa, turmas, database, hoje
):
    login = {"registration": "251000000", "password": "senha123"}
    client.post("/auth/sigaa", json=login)
    hoje(date(2026, 12, 23))
    _participantes_sincronizados_em(database, datetime(2026, 12, 22, 12, tzinfo=UTC))
    lidas = turmas.classrooms.list_classroom_members.await_count

    client.post("/auth/sigaa", json=login)
    assert client.get("/classrooms/AAA/members").status_code == 200
    assert client.get("/classrooms/AAA/members", headers=NO_CACHE).status_code == 200

    assert turmas.classrooms.list_classroom_members.await_count == lidas


def test_participantes_sem_cache_buscam_depois_da_tolerancia_do_semestre(
    client, turmas, cookies, hoje
):
    hoje(date(2026, 12, 22))
    client.cookies.update(cookies(refresh=CREDENCIAIS))

    assert len(client.get("/classrooms/AAA/members").json()) == 3
    assert turmas.classrooms.list_classroom_members.await_count == 1


def _login(client) -> None:
    client.post(
        "/auth/sigaa", json={"registration": "251000000", "password": "senha123"}
    )


def _mencoes_sincronizadas_em(database, synced_at: datetime) -> None:
    with database() as session:
        session.execute(update(ClassroomUser).values(grade_synced_at=synced_at))
        session.commit()


def _mencoes_lidas(turmas) -> list[str]:
    return sorted(
        c.args[0] for c in turmas.classrooms.get_classroom_grade.await_args_list
    )


def test_mencao_vem_com_a_turma_pelo_sync_do_login(client, sigaa, turmas):
    turmas.classrooms.get_classroom_grade.side_effect = lambda turma: (
        Grade.MS if turma == "BBB" else None
    )
    _login(client)

    response = client.get("/classrooms?semester=all")

    assert {c["id"]: c["grade"] for c in response.json()} == {"AAA": None, "BBB": "MS"}
    assert _mencoes_lidas(turmas) == ["AAA", "BBB"]


def test_mencao_vencida_revalida_e_a_de_semestre_consolidado_congela(
    client, sigaa, turmas, database
):
    _login(client)
    _mencoes_sincronizadas_em(database, datetime.now(UTC) - timedelta(days=2))
    turmas.classrooms.get_classroom_grade.reset_mock()

    _login(client)

    # 2025.2 já foi consolidado: o sync que veio depois disso é o último.
    assert _mencoes_lidas(turmas) == ["AAA"]


# 2026.2 consolida em 19/12: com a tolerância, a menção congela no sync a partir de 23/12.
@pytest.mark.parametrize(
    ("synced_at", "lidas"),
    [
        (datetime(2026, 12, 22, 12, tzinfo=UTC), ["AAA"]),
        (datetime(2026, 12, 23, 12, tzinfo=UTC), []),
    ],
)
def test_mencao_faz_um_ultimo_sync_depois_da_consolidacao(
    client, sigaa, turmas, database, hoje, synced_at, lidas
):
    _login(client)
    hoje(date(2026, 12, 30))
    _mencoes_sincronizadas_em(database, synced_at)
    turmas.classrooms.get_classroom_grade.reset_mock()

    _login(client)

    assert _mencoes_lidas(turmas) == lidas


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


def frequency_view_json(
    frequency: ClassroomFrequency, classroom: Classroom = CURRENT, marks=None
) -> dict:
    timetable = Timetable.parse(classroom.schedule)
    days = class_days(classroom.semester) if classroom.current else ()
    lessons = build_lessons(frequency, timetable, marks or {}, days)
    return ClassroomFrequencyView(
        **dict(frequency),
        lessons=lessons,
        totals=frequency_totals(frequency, lessons, timetable, classroom.subject.hours),
    ).model_dump(mode="json")


def _with_entries(*entries: AttendanceEntry) -> ClassroomFrequency:
    return ClassroomFrequency(
        progress=FREQUENCY.progress,
        frequency=FREQUENCY.frequency.model_copy(update={"entries": entries}),
    )


def _keys(lessons) -> list[tuple[date, int, LessonStatus]]:
    return [(lesson.occurred_on, lesson.position, lesson.status) for lesson in lessons]


def test_horario_vira_aulas_por_dia_com_suas_horas_aula():
    assert Timetable.parse("35T23").sessions == {1: (2,), 3: (2,)}
    # Blocos colados são uma aula só; separados, duas.
    assert Timetable.parse("35M5 35T1").sessions == {1: (2,), 3: (2,)}
    assert Timetable.parse("3M12 3T45").sessions == {1: (2, 2)}
    assert Timetable.parse("6M1234").sessions == {4: (4,)}
    assert Timetable.parse(None).sessions == {}
    assert Timetable.parse("99Z9").sessions == {}


def test_aula_fora_do_horario_vale_o_tamanho_usual():
    timetable = Timetable.parse("2M12 4M123 6M123")
    assert timetable.hours(date(2026, 8, 10), 0) == 2
    assert timetable.hours(date(2026, 8, 10), 1) == 3
    assert timetable.hours(date(2026, 8, 15), 0) == 3
    assert Timetable.parse(None).hours(date(2026, 8, 10), 0) == 1


def test_aulas_previstas_respeitam_periodo_horario_e_dia_atual():
    lessons = build_lessons(
        NOT_REGISTERED,
        Timetable.parse("35M5 35T1"),
        {},
        class_days("2026.2", on=date(2026, 8, 14)),
    )
    assert _keys(lessons) == [
        (date(2026, 8, 13), 0, LessonStatus.NAO_REGISTRADA),
        (date(2026, 8, 11), 0, LessonStatus.NAO_REGISTRADA),
    ]


def test_aulas_previstas_excluem_feriado_e_semana_universitaria():
    days = set(class_days("2026.2", on=date(2026, 9, 23)))
    assert date(2026, 8, 10) in days
    assert date(2026, 9, 7) not in days
    assert date(2026, 9, 21) not in days


def test_aulas_previstas_completam_as_chamadas_publicadas_no_mesmo_dia():
    frequency = _with_entries(
        AttendanceEntry(occurred_on=date(2026, 8, 11), status=AttendanceStatus.PRESENTE)
    )
    lessons = build_lessons(
        frequency,
        Timetable.parse("3M12 3T45"),
        {},
        class_days("2026.2", on=date(2026, 8, 12)),
    )
    assert _keys(lessons) == [
        (date(2026, 8, 11), 1, LessonStatus.NAO_REGISTRADA),
        (date(2026, 8, 11), 0, LessonStatus.PRESENTE),
    ]


def test_aulas_previstas_nao_inventam_dias_sem_horario_ou_calendario():
    days = list(class_days("2026.2"))
    assert build_lessons(NOT_REGISTERED, Timetable.parse(None), {}, days) == ()
    assert list(class_days("2099.1")) == []


def test_marcacao_vale_so_onde_o_sigaa_nao_registrou_e_falta_conta_as_horas_aula():
    marks = {
        (date(2026, 9, 20), 0): LessonMarkStatus.FALTA,
        (date(2026, 9, 24), 0): LessonMarkStatus.FALTA,
        (date(2026, 9, 25), 0): LessonMarkStatus.CANCELADA,
    }
    lessons = build_lessons(FREQUENCY, Timetable.parse("2346T23"), marks)
    assert [
        (lesson.occurred_on, lesson.status, lesson.absences, lesson.marked)
        for lesson in lessons
    ] == [
        (date(2026, 9, 25), LessonStatus.CANCELADA, 0, True),
        (date(2026, 9, 24), LessonStatus.FALTA, 2, True),
        (date(2026, 9, 22), LessonStatus.FALTA, 2, False),
        (date(2026, 9, 20), LessonStatus.PRESENTE, 0, False),
    ]


def test_totais_somam_marcacoes_em_horas_aula_e_ignoram_canceladas():
    timetable = Timetable.parse("2346T23")
    marks = {
        (date(2026, 9, 24), 0): LessonMarkStatus.FALTA,
        (date(2026, 9, 25), 0): LessonMarkStatus.PRESENTE,
        (date(2026, 9, 28), 0): LessonMarkStatus.CANCELADA,
    }
    lessons = build_lessons(FREQUENCY, timetable, marks)
    assert frequency_totals(FREQUENCY, lessons, timetable, 90) == FrequencyTotals(
        presences=2, absences=4, percentage=88.2, max_absences=22, estimated=True
    )
    assert frequency_totals(
        FREQUENCY, build_lessons(FREQUENCY, timetable, {}), timetable, 90
    ) == FrequencyTotals(
        presences=1, absences=2, percentage=93.8, max_absences=22, estimated=False
    )


@pytest.mark.parametrize(
    "hours,expected",
    [(30, 6), (60, 14), (90, 22), (15, 2), (7, 0), (0, None), (None, None)],
)
def test_maximo_de_faltas_pela_carga_horaria(hours, expected):
    assert max_absences(hours) == expected


def test_aula_sem_chamada_conta_como_presenca_so_na_porcentagem():
    timetable = Timetable.parse("2346T23")
    sem_chamada = build_lessons(FREQUENCY, timetable, {})
    # 28 de 30 horas-aula do SIGAA + a aula de 24/09 (2h) sem chamada.
    totals = frequency_totals(FREQUENCY, sem_chamada, timetable, 90)
    assert (totals.presences, totals.absences, totals.percentage) == (1, 2, 93.8)
    # Cancelada fica de fora: a porcentagem volta à do SIGAA.
    cancelada = build_lessons(
        FREQUENCY, timetable, {(date(2026, 9, 24), 0): LessonMarkStatus.CANCELADA}
    )
    assert frequency_totals(FREQUENCY, cancelada, timetable, 90).percentage == 93.3


def test_totais_sem_chamada_do_sigaa_vem_so_das_marcacoes():
    timetable = Timetable.parse("2346T23")
    marks = {
        (date(2026, 9, 24), 0): LessonMarkStatus.PRESENTE,
        (date(2026, 9, 25), 0): LessonMarkStatus.FALTA,
    }
    lessons = build_lessons(NOT_REGISTERED, timetable, marks)
    assert frequency_totals(NOT_REGISTERED, lessons, timetable, 90) == FrequencyTotals(
        presences=1, absences=2, percentage=50, max_absences=22, estimated=True
    )
    cancelled = build_lessons(
        NOT_REGISTERED, timetable, {(date(2026, 9, 24), 0): LessonMarkStatus.CANCELADA}
    )
    assert frequency_totals(NOT_REGISTERED, cancelled, timetable, 90) is None


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
        assert response.json() == frequency_view_json(FREQUENCY)
        assert response.headers["cache-control"] == "private, no-cache"
    account.classrooms.get_classroom_frequency.assert_awaited_once_with("HASH-A")
    assert qstash.published == []
    with database() as session:
        rows = list(session.scalars(select(ClassroomFrequencyCache)))
        assert len(rows) == 1
        assert rows[0].frequency == FREQUENCY.frequency.model_dump(mode="json")
        assert rows[0].frequency_status is FrequencyStatus.PARCIALMENTE_REGISTRADA
        classroom = session.scalar(
            select(ClassroomModel).where(ClassroomModel.sigaa_id == CURRENT.sigaa_id)
        )
        assert classroom.progress == FREQUENCY.progress.model_dump(mode="json")


def test_agregado_retorna_apenas_atuais_identificadas_em_ordem_e_reutiliza_cache(
    logged, account
):
    account.classrooms.get_classroom_frequency.side_effect = [FREQUENCY, NOT_REGISTERED]
    response = logged.get("/classrooms/frequency")
    assert response.status_code == 200
    assert response.json() == [
        {
            "classroom": {**CURRENT.model_dump(mode="json"), "grade": None},
            **frequency_view_json(FREQUENCY),
        },
        {
            "classroom": {**SECOND.model_dump(mode="json"), "grade": None},
            **frequency_view_json(NOT_REGISTERED, SECOND),
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


def test_sem_lancamentos_preserva_progress_e_cache(logged, account, database):
    account.classrooms.get_classroom_frequency.return_value = NOT_REGISTERED
    for _ in range(2):
        response = logged.get("/classrooms/HASH-A/frequency")
        assert response.status_code == 200
        assert response.json() == frequency_view_json(NOT_REGISTERED)
    account.classrooms.get_classroom_frequency.assert_awaited_once()
    with database() as session:
        row = session.scalar(select(ClassroomFrequencyCache))
        assert (row.frequency, row.frequency_status) == (
            None,
            FrequencyStatus.NAO_REGISTRADA,
        )


def test_rota_inclui_aulas_passadas_sem_lancamento_sem_inventar_totais(logged, account):
    account.classrooms.get_classroom_frequency.return_value = NOT_REGISTERED
    account.classrooms.list_classrooms.return_value = [
        CURRENT.model_copy(update={"schedule": "35T23"})
    ]
    response = logged.get("/classrooms/HASH-A/frequency")
    assert response.status_code == 200
    data = response.json()
    assert data["frequency"] is None
    assert data["frequency_status"] == "nao_registrada"
    assert data["totals"] is None
    assert {
        "occurred_on": "2026-08-11",
        "position": 0,
        "status": "nao_registrada",
        "absences": 0,
        "marked": False,
    } in data["lessons"]
    assert all(lesson["occurred_on"] < "2026-09-22" for lesson in data["lessons"])


@pytest.mark.parametrize("frequency", [NOT_REGISTERED, FREQUENCY])
def test_turma_antiga_nao_gera_aulas_previstas(logged, account, frequency):
    old = CURRENT.model_copy(
        update={"semester": "2026.1", "current": False, "schedule": "35T23"}
    )
    account.classrooms.list_classrooms.return_value = [old]
    account.classrooms.get_classroom_frequency.return_value = frequency

    response = logged.get("/classrooms/HASH-A/frequency")

    assert response.status_code == 200
    assert response.json() == frequency_view_json(frequency, old)
    assert len(response.json()["lessons"]) == len(
        frequency.frequency.entries if frequency.frequency else ()
    )


LESSON = "/classrooms/HASH-A/frequency/lessons/2026-09-24/0"


def _lesson(response, occurred_on: str, position: int = 0) -> dict:
    return next(
        lesson
        for lesson in response.json()["lessons"]
        if (lesson["occurred_on"], lesson["position"]) == (occurred_on, position)
    )


def test_marcacao_persiste_muda_de_status_e_pode_ser_removida(
    logged, account, database
):
    for status in ("falta", "presente", "cancelada"):
        assert logged.put(LESSON, json={"status": status}).status_code == 204
        lesson = _lesson(logged.get("/classrooms/HASH-A/frequency"), "2026-09-24")
        assert (lesson["status"], lesson["marked"]) == (status, True)
    with database() as session:
        marks = list(session.scalars(select(LessonMark)))
        assert [(m.occurred_on, m.position, m.status) for m in marks] == [
            (date(2026, 9, 24), 0, LessonMarkStatus.CANCELADA)
        ]
    assert logged.delete(LESSON).status_code == 204
    lesson = _lesson(logged.get("/classrooms/HASH-A/frequency"), "2026-09-24")
    assert (lesson["status"], lesson["marked"]) == ("nao_registrada", False)
    assert logged.delete(LESSON).status_code == 204


def test_marcacao_entra_nos_totais_da_frequencia(logged, account):
    assert logged.put(LESSON, json={"status": "falta"}).status_code == 204
    response = logged.get("/classrooms/HASH-A/frequency")
    assert response.json()["totals"] == {
        "presences": 1,
        "absences": 3,
        "percentage": 90.3,
        "max_absences": 22,
        "estimated": True,
    }
    assert response.json()["frequency"] == FREQUENCY.frequency.model_dump(mode="json")


def test_chamada_do_sigaa_prevalece_sobre_a_marcacao(logged, account):
    account.classrooms.get_classroom_frequency.return_value = NOT_REGISTERED
    path = "/classrooms/HASH-A/frequency/lessons/2026-09-22/0"
    assert logged.put(path, json={"status": "presente"}).status_code == 204
    lesson = _lesson(logged.get("/classrooms/HASH-A/frequency"), "2026-09-22")
    assert (lesson["status"], lesson["marked"]) == ("presente", True)

    account.classrooms.get_classroom_frequency.return_value = FREQUENCY
    response = logged.get("/classrooms/HASH-A/frequency", headers=NO_CACHE)
    lesson = _lesson(response, "2026-09-22")
    assert (lesson["status"], lesson["absences"], lesson["marked"]) == (
        "falta",
        2,
        False,
    )


def test_chamada_de_uma_das_aulas_no_mesmo_dia_preserva_a_outra(logged, account):
    account.classrooms.get_classroom_frequency.return_value = NOT_REGISTERED
    assert logged.put(LESSON, json={"status": "falta"}).status_code == 204
    second = LESSON.removesuffix("0") + "1"
    assert logged.put(second, json={"status": "falta"}).status_code == 204
    account.classrooms.get_classroom_frequency.return_value = _with_entries(
        AttendanceEntry(
            occurred_on=date(2026, 9, 24), status=AttendanceStatus.NAO_REGISTRADA
        ),
        AttendanceEntry(
            occurred_on=date(2026, 9, 24), status=AttendanceStatus.PRESENTE
        ),
    )
    response = logged.get("/classrooms/HASH-A/frequency", headers=NO_CACHE)
    assert [
        (lesson["position"], lesson["status"], lesson["marked"])
        for lesson in response.json()["lessons"]
        if lesson["occurred_on"] == "2026-09-24"
    ] == [(1, "presente", False), (0, "falta", True)]


def test_refresh_preserva_marcacao(logged, account):
    assert logged.put(LESSON, json={"status": "falta"}).status_code == 204
    account.classrooms.get_classroom_frequency.return_value = NOT_REGISTERED
    response = logged.get("/classrooms/HASH-A/frequency", headers=NO_CACHE)
    assert _lesson(response, "2026-09-24")["marked"] is True


def test_marcacao_exige_login_e_turma_do_aluno(client, logged, account):
    body = {"status": "falta"}
    assert logged.put(LESSON, json=body).status_code == 204
    unknown = LESSON.replace("HASH-A", "UNKNOWN")
    assert logged.put(unknown, json=body).status_code == 404
    assert logged.delete(unknown).status_code == 404
    logged.cookies.clear()
    assert client.put(LESSON, json=body).status_code == 401
    assert client.delete(LESSON).status_code == 401


def test_marcacoes_nao_sao_compartilhadas_entre_alunos(logged, account, cookies):
    assert logged.put(LESSON, json={"status": "falta"}).status_code == 204
    other = Credentials(registration="252000000", password=SecretStr("outra"))
    logged.cookies.clear()
    logged.cookies.update(cookies(access="other-token", refresh=other))
    account.profile.get_profile.return_value = (
        account.profile.get_profile.return_value.model_copy(
            update={"registration": other.registration}
        )
    )
    response = logged.get("/classrooms/HASH-A/frequency")
    assert not any(lesson["marked"] for lesson in response.json()["lessons"])
    logged.cookies.clear()
    logged.cookies.update(cookies(access="tok", refresh=CREDENCIAIS))
    response = logged.get("/classrooms/HASH-A/frequency")
    assert _lesson(response, "2026-09-24")["marked"] is True


def test_marcacao_valida_dados(logged, account):
    assert logged.put(LESSON, json={"status": "nao_registrada"}).status_code == 422
    assert logged.put(LESSON, json={}).status_code == 422
    for path in (
        "/classrooms/HASH-A/frequency/lessons/2026-09-24/-1",
        "/classrooms/HASH-A/frequency/lessons/ontem/0",
    ):
        assert logged.put(path, json={"status": "falta"}).status_code == 422
        assert logged.delete(path).status_code == 422


def test_refresh_reconsulta_sigaa_e_atualiza_mesmo_cache(logged, account):
    logged.get("/classrooms/HASH-A/frequency")
    account.classrooms.get_classroom_frequency.return_value = NOT_REGISTERED
    assert logged.get(
        "/classrooms/1614141/frequency", headers=NO_CACHE
    ).json() == frequency_view_json(NOT_REGISTERED)
    assert logged.get("/classrooms/HASH-A/frequency").json() == frequency_view_json(
        NOT_REGISTERED
    )
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
    assert logged.get("/classrooms/1614141/frequency").json() == frequency_view_json(
        FREQUENCY
    )
    assert logged.get("/classrooms/HASH-A/frequency").json() == frequency_view_json(
        NOT_REGISTERED
    )
    assert [
        (job.registration, job.classroom_id, job.steps) for job in qstash.jobs()
    ] == [(CREDENCIAIS.registration, "HASH-A", (Step.of(sync_frequency),))]


def test_frequencia_de_semestre_passado_por_hash_nao_vence(logged, account, database):
    logged.get("/classrooms/HASH-OLD/frequency")
    age_cache(database, days=365)
    assert logged.get("/classrooms/HASH-OLD/frequency").json() == frequency_view_json(
        FREQUENCY, OLD
    )
    account.classrooms.get_classroom_frequency.assert_awaited_once_with("HASH-OLD")


def test_cache_invalido_e_refeito(logged, account, database):
    logged.get("/classrooms/HASH-A/frequency")
    with database() as session:
        session.execute(
            update(ClassroomFrequencyCache).values(frequency={"entries": "x"})
        )
        session.commit()
    assert logged.get("/classrooms/HASH-A/frequency").json() == frequency_view_json(
        FREQUENCY
    )
    assert account.classrooms.get_classroom_frequency.await_count == 2


def test_cache_antigo_ganha_estado_e_resumo_sem_nova_consulta(
    logged, account, database
):
    logged.get("/classrooms/HASH-A/frequency")
    data = FREQUENCY.frequency.model_dump(mode="json")
    data.pop("summary")
    with database() as session:
        session.execute(update(ClassroomFrequencyCache).values(frequency=data))
        session.commit()
    response = logged.get("/classrooms/HASH-A/frequency")
    assert response.status_code == 200
    assert response.json()["frequency_status"] == "parcialmente_registrada"
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
        assert item["frequency_status"] == "nao_registrada"
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
    assert logged.get("/classrooms/1614141/frequency").json() == frequency_view_json(
        NOT_REGISTERED
    )
    with database() as session:
        rows = list(session.scalars(select(ClassroomFrequencyCache)))
        assert len(rows) == 2
        assert len({row.user_classroom_id for row in rows}) == 2
    logged.cookies.clear()
    logged.cookies.update(cookies(access="tok", refresh=CREDENCIAIS))
    assert logged.get("/classrooms/1614141/frequency").json() == frequency_view_json(
        FREQUENCY
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
    assert logged.get("/classrooms/HASH-A/frequency").json() == frequency_view_json(
        FREQUENCY
    )


def test_turma_que_sai_da_lista_some_mas_guarda_o_motivo(logged, account, database):
    logged.get("/classrooms/HASH-A/frequency")
    account.classrooms.list_classrooms.return_value = [SECOND]
    logged.get("/classrooms", headers=NO_CACHE)

    assert logged.get("/classrooms/HASH-A/frequency").status_code == 404
    with database() as session:
        link = session.scalar(
            select(ClassroomUser).where(ClassroomUser.frequency_cache.has())
        )
        assert (link.front_end_id, link.current, link.status) == (
            None,
            False,
            ClassroomStatus.TRANCADO,
        )


def test_openapi_documenta_frequencia_individual_e_agregada(client):
    paths = client.get("/openapi.json").json()["paths"]
    for path in ("/classrooms/frequency", "/classrooms/{classroom_id}/frequency"):
        route = paths[path]["get"]
        assert {"401", "404", "502", "503"} <= route["responses"].keys()
        assert any(p["name"] == "Cache-Control" for p in route["parameters"])


AGORA = datetime(2026, 9, 22, tzinfo=UTC)


def _turma(
    front_end_id: str,
    code: str = "FGA0146",
    semester: str = "2026.2",
    *,
    room: str | None = None,
    current: bool = False,
) -> sigaa_client.Classroom:
    return sigaa_client.Classroom(
        id=front_end_id,
        number="01",
        semester=semester,
        room=room,
        current=current,
        subject=sigaa_client.Subject(code=code, name=f"DISCIPLINA {code}", hours=60),
    )


def _membro(name: str, **fields) -> ClassroomMember:
    return ClassroomMember(
        name=name, role=fields.pop("role", ClassroomRole.ALUNO), **fields
    )


@pytest.fixture
async def usuarios(async_database) -> list[User]:
    async with async_database() as session:
        users = [
            User(
                name=f"Discente {index}",
                registration=f"25100000{index}",
                level=UserLevel.GRADUACAO,
                profile_synced_at=AGORA,
            )
            for index in range(2)
        ]
        session.add_all(users)
        await session.commit()
    return users


async def _salvar_turmas(async_database, user: User, turmas) -> None:
    async with async_database() as session:
        user = await session.get_one(User, user.id)
        await ClassroomRepository(session).save_user_classrooms(user, turmas, AGORA)
        await session.commit()


async def _vinculos(async_database, user: User) -> list[ClassroomUser]:
    async with async_database() as session:
        links = await ClassroomRepository(session).list_by_user_id(user.id)
    return [link.row for link in links]


async def _contar(async_database, model) -> int:
    async with async_database() as session:
        return await session.scalar(select(func.count()).select_from(model))


async def test_turmas_do_usuario_guardam_id_do_sigaa_e_semestre_atual(
    async_database, usuarios
):
    await _salvar_turmas(
        async_database,
        usuarios[0],
        [_turma("AAA", current=True), _turma("BBB", "FGA0158", "2025.2")],
    )

    links = await _vinculos(async_database, usuarios[0])

    assert sorted((l.front_end_id, l.current, l.classroom.semester) for l in links) == [
        ("AAA", True, "2026.2"),
        ("BBB", False, "2025.2"),
    ]
    assert {l.classroom.subject.code for l in links} == {"FGA0146", "FGA0158"}


async def _situacao_na_lista(async_database, user: User) -> dict:
    async with async_database() as session:
        rows = await session.execute(
            select(SubjectModel.code, ClassroomUser.front_end_id, ClassroomUser.status)
            .join(ClassroomUser.classroom)
            .join(ClassroomModel.subject)
            .where(ClassroomUser.user_id == user.id)
        )
    return {code: (front_end_id, status) for code, front_end_id, status in rows}


@pytest.mark.parametrize(
    ("dia", "status"),
    [
        (date(2026, 8, 14), ClassroomStatus.REMOVIDO),
        (date(2026, 8, 15), ClassroomStatus.TRANCADO),
    ],
)
async def test_turma_que_saiu_da_lista_e_removida_ou_trancada_pelo_calendario(
    async_database, usuarios, hoje, dia, status
):
    await _salvar_turmas(
        async_database, usuarios[0], [_turma("AAA"), _turma("BBB", "FGA0158")]
    )
    hoje(dia)
    await _salvar_turmas(async_database, usuarios[0], [_turma("AAA")])

    links = await _vinculos(async_database, usuarios[0])

    assert [l.front_end_id for l in links] == ["AAA"]
    assert await _situacao_na_lista(async_database, usuarios[0]) == {
        "FGA0146": ("AAA", ClassroomStatus.CURSANDO),
        "FGA0158": (None, status),
    }


async def test_turma_que_volta_para_a_lista_volta_cursando(
    async_database, usuarios, hoje
):
    await _salvar_turmas(
        async_database, usuarios[0], [_turma("AAA"), _turma("BBB", "FGA0158")]
    )
    await _salvar_turmas(async_database, usuarios[0], [_turma("AAA")])
    # A saída mantém o primeiro motivo, mesmo depois da matrícula extraordinária.
    hoje(date(2026, 10, 1))
    await _salvar_turmas(async_database, usuarios[0], [_turma("AAA")])
    assert (await _situacao_na_lista(async_database, usuarios[0]))["FGA0158"] == (
        None,
        ClassroomStatus.TRANCADO,
    )

    await _salvar_turmas(
        async_database, usuarios[0], [_turma("AAA"), _turma("CCC", "FGA0158")]
    )

    assert (await _situacao_na_lista(async_database, usuarios[0]))["FGA0158"] == (
        "CCC",
        ClassroomStatus.CURSANDO,
    )


async def test_turma_sem_numero_ou_codigo_nao_e_gravada(async_database, usuarios):
    # A turma só do portal ainda não tem o número e o código que o histórico traz.
    sem_numero = _turma("AAA", current=True).model_copy(update={"number": ""})
    sem_codigo = _turma("CCC", current=True).model_copy(
        update={"subject": sigaa_client.Subject(name="DISCIPLINA SEM CÓDIGO")}
    )

    await _salvar_turmas(
        async_database,
        usuarios[0],
        [sem_numero, sem_codigo, _turma("BBB", "FGA0158")],
    )

    links = await _vinculos(async_database, usuarios[0])
    assert [l.front_end_id for l in links] == ["BBB"]
    assert await _contar(async_database, ClassroomModel) == 1
    assert await _contar(async_database, SubjectModel) == 1


async def test_turma_e_compartilhada_entre_alunos(async_database, usuarios):
    await _salvar_turmas(async_database, usuarios[0], [_turma("AAA", room="MOCAP")])
    # O segundo aluno só vê a turma pelo histórico, sem a sala.
    await _salvar_turmas(async_database, usuarios[1], [_turma("XYZ")])

    assert await _contar(async_database, ClassroomModel) == 1
    assert await _contar(async_database, SubjectModel) == 1
    link = (await _vinculos(async_database, usuarios[1]))[0]
    assert (link.front_end_id, link.classroom.room) == ("XYZ", "MOCAP")


async def _salvar_membros(async_database, classroom_id: UUID, membros) -> None:
    async with async_database() as session:
        await ClassroomRepository(session).save_members(classroom_id, membros, AGORA)
        await session.commit()


async def _membros(async_database, classroom_id: UUID) -> list[ClassroomUser]:
    async with async_database() as session:
        return await ClassroomRepository(session).list_members(classroom_id)


async def test_participantes_viram_usuarios_sombra_sem_duplicar(
    async_database, usuarios
):
    await _salvar_turmas(async_database, usuarios[0], [_turma("AAA")])
    classroom_id = (await _vinculos(async_database, usuarios[0]))[0].classroom_id
    membros = [
        _membro("NOME DOCENTE", role=ClassroomRole.PROFESSOR, email="d@unb.br"),
        _membro("Discente 0", registration="251000000", person_id=7, email="eu@x.org"),
        _membro("COLEGA", registration="251000009", person_id=9),
    ]

    await _salvar_membros(async_database, classroom_id, membros)
    await _salvar_membros(async_database, classroom_id, membros)

    links = await _membros(async_database, classroom_id)
    assert sorted((l.user.name, l.role) for l in links) == [
        ("COLEGA", ClassroomRole.ALUNO),
        ("Discente 0", ClassroomRole.ALUNO),
        ("NOME DOCENTE", ClassroomRole.PROFESSOR),
    ]
    assert await _contar(async_database, User) == 4
    eu = next(l for l in links if l.user_id == usuarios[0].id)
    # O vínculo da própria lista continua o mesmo, e o perfil ganha o que faltava.
    assert (eu.front_end_id, eu.user.person_id, eu.user.email) == ("AAA", 7, "eu@x.org")


async def test_docente_e_identificado_pelo_email_entre_turmas(async_database, usuarios):
    await _salvar_turmas(
        async_database, usuarios[0], [_turma("AAA"), _turma("BBB", "FGA0158")]
    )
    links = await _vinculos(async_database, usuarios[0])
    docente = _membro("NOME DOCENTE", role=ClassroomRole.PROFESSOR, email="d@unb.br")
    await _salvar_membros(async_database, links[0].classroom_id, [docente])
    # Mesmo email com outro nome é o mesmo docente; mesmo nome sem email, não.
    await _salvar_membros(
        async_database,
        links[1].classroom_id,
        [docente.model_copy(update={"name": "NOME ABREVIADO"})],
    )

    async with async_database() as session:
        docentes = list(
            await session.scalars(select(User).where(User.email == "d@unb.br"))
        )
    assert [d.name for d in docentes] == ["NOME ABREVIADO"]


async def test_docente_visto_so_pelo_email_ganha_o_id_pessoa(async_database, usuarios):
    await _salvar_turmas(
        async_database, usuarios[0], [_turma("AAA"), _turma("BBB", "FGA0158")]
    )
    links = await _vinculos(async_database, usuarios[0])
    docente = _membro("NOME DOCENTE", role=ClassroomRole.PROFESSOR, email="d@unb.br")
    await _salvar_membros(async_database, links[0].classroom_id, [docente])
    await _salvar_membros(
        async_database,
        links[1].classroom_id,
        [docente.model_copy(update={"person_id": 42})],
    )

    async with async_database() as session:
        docentes = list(
            await session.scalars(select(User).where(User.email == "d@unb.br"))
        )
    assert [d.person_id for d in docentes] == [42]


async def test_docente_sem_email_nao_duplica_no_resync_da_turma(
    async_database, usuarios
):
    await _salvar_turmas(async_database, usuarios[0], [_turma("AAA")])
    classroom_id = (await _vinculos(async_database, usuarios[0]))[0].classroom_id
    docente = _membro("NOME DOCENTE", role=ClassroomRole.PROFESSOR)

    await _salvar_membros(async_database, classroom_id, [docente])
    await _salvar_membros(async_database, classroom_id, [docente])

    assert await _contar(async_database, User) == 3


async def test_id_pessoa_de_outro_usuario_nao_e_copiado(async_database, usuarios):
    await _salvar_turmas(
        async_database, usuarios[0], [_turma("AAA"), _turma("BBB", "FGA0158")]
    )
    links = await _vinculos(async_database, usuarios[0])
    await _salvar_membros(
        async_database, links[0].classroom_id, [_membro("PESSOA", person_id=42)]
    )
    # Na outra turma a mesma pessoa aparece já com a matrícula de um usuário existente.
    await _salvar_membros(
        async_database,
        links[1].classroom_id,
        [_membro("Discente 0", registration="251000000", person_id=42)],
    )

    async with async_database() as session:
        eu = await session.get_one(User, usuarios[0].id)
        assert eu.person_id is None
    assert await _contar(async_database, User) == 3


async def test_turma_grande_nao_consulta_o_banco_por_participante(
    async_database, usuarios
):
    await _salvar_turmas(async_database, usuarios[0], [_turma("AAA")])
    classroom_id = (await _vinculos(async_database, usuarios[0]))[0].classroom_id
    membros = [
        _membro(f"ALUNO {i}", registration=f"26{i:07}", person_id=i, email=f"{i}@x")
        for i in range(300)
    ]
    await _salvar_membros(async_database, classroom_id, membros[:100])

    selects: list[str] = []
    engine = async_database.kw["bind"].sync_engine
    listener = lambda *args: selects.append(args[2])
    event.listen(engine, "before_cursor_execute", listener)
    try:
        await _salvar_membros(async_database, classroom_id, membros)
    finally:
        event.remove(engine, "before_cursor_execute", listener)

    assert len([sql for sql in selects if sql.lstrip().startswith("SELECT")]) < 10
    assert len(await _membros(async_database, classroom_id)) == 300
    assert await _contar(async_database, User) == 302


async def test_participante_repetido_na_listagem_vira_um_usuario_so(
    async_database, usuarios
):
    await _salvar_turmas(async_database, usuarios[0], [_turma("AAA")])
    classroom_id = (await _vinculos(async_database, usuarios[0]))[0].classroom_id
    docente = _membro("DOCENTE", role=ClassroomRole.PROFESSOR, email="d@unb.br")
    colega = _membro("COLEGA", registration="251000009", person_id=9)

    await _salvar_membros(
        async_database,
        classroom_id,
        [docente, colega, docente.model_copy(update={"person_id": 42}), colega],
    )

    assert await _contar(async_database, User) == 4
    async with async_database() as session:
        achado = await session.scalar(select(User).where(User.email == "d@unb.br"))
    assert achado is not None and achado.person_id == 42


async def test_turma_passada_existente_nao_e_regravada(async_database, usuarios):
    passada = _turma("AAA", semester="2025.2").model_copy(update={"schedule": "24T23"})
    atual = _turma("CCC", "FGA0158", room="MOCAP", current=True)
    await _salvar_turmas(async_database, usuarios[0], [passada, atual])

    await _salvar_turmas(
        async_database,
        usuarios[1],
        [
            passada.model_copy(update={"id": "XYZ", "schedule": "99Z9"}),
            atual.model_copy(update={"id": "WWW", "room": "SALA 02"}),
        ],
    )

    links = await _vinculos(async_database, usuarios[1])
    assert sorted(
        (l.front_end_id, l.classroom.schedule, l.classroom.room) for l in links
    ) == [
        ("WWW", None, "SALA 02"),
        ("XYZ", "24T23", None),
    ]


async def _situacoes(async_database, classroom_id: UUID) -> dict:
    async with async_database() as session:
        rows = await session.execute(
            select(User.name, ClassroomUser.status, ClassroomUser.member)
            .join(ClassroomUser.user)
            .where(ClassroomUser.classroom_id == classroom_id)
        )
    return {name: (status, member) for name, status, member in rows}


@pytest.mark.parametrize(
    ("dia", "status"),
    [
        (date(2026, 8, 14), ClassroomStatus.REMOVIDO),
        (date(2026, 8, 15), ClassroomStatus.TRANCADO),
    ],
)
async def test_aluno_que_some_da_turma_e_removido_ou_trancado_pelo_calendario(
    async_database, usuarios, hoje, dia, status
):
    await _salvar_turmas(async_database, usuarios[0], [_turma("AAA")])
    classroom_id = (await _vinculos(async_database, usuarios[0]))[0].classroom_id
    eu = _membro("Discente 0", registration="251000000")
    colega = _membro("COLEGA", registration="251000009")
    await _salvar_membros(async_database, classroom_id, [eu, colega])
    assert await _situacoes(async_database, classroom_id) == {
        "Discente 0": (ClassroomStatus.CURSANDO, True),
        "COLEGA": (ClassroomStatus.CURSANDO, True),
    }

    hoje(dia)
    await _salvar_membros(async_database, classroom_id, [])

    assert await _membros(async_database, classroom_id) == []
    assert await _situacoes(async_database, classroom_id) == {
        "Discente 0": (status, False),
        "COLEGA": (status, False),
    }
    # O vínculo que veio da lista do próprio usuário continua.
    assert len(await _vinculos(async_database, usuarios[0])) == 1


@pytest.mark.parametrize(
    ("saida", "status"),
    [
        (date(2026, 8, 10), ClassroomStatus.REMOVIDO),
        (date(2026, 9, 22), ClassroomStatus.TRANCADO),
    ],
)
async def test_aluno_que_saiu_mantem_o_motivo_e_volta_cursando(
    async_database, usuarios, hoje, saida, status
):
    await _salvar_turmas(async_database, usuarios[0], [_turma("AAA")])
    classroom_id = (await _vinculos(async_database, usuarios[0]))[0].classroom_id
    colega = _membro("COLEGA", registration="251000009")
    hoje(saida)
    await _salvar_membros(async_database, classroom_id, [colega])
    await _salvar_membros(async_database, classroom_id, [])

    hoje(date(2026, 10, 1))
    await _salvar_membros(async_database, classroom_id, [])
    assert (await _situacoes(async_database, classroom_id))["COLEGA"] == (
        status,
        False,
    )

    await _salvar_membros(async_database, classroom_id, [colega])
    assert (await _situacoes(async_database, classroom_id))["COLEGA"] == (
        ClassroomStatus.CURSANDO,
        True,
    )
    assert [l.user.name for l in await _membros(async_database, classroom_id)] == [
        "COLEGA"
    ]


async def test_docente_que_saiu_da_turma_perde_o_vinculo(async_database, usuarios):
    await _salvar_turmas(async_database, usuarios[0], [_turma("AAA")])
    classroom_id = (await _vinculos(async_database, usuarios[0]))[0].classroom_id
    eu = _membro("Discente 0", registration="251000000")
    docente = _membro("DOCENTE", role=ClassroomRole.PROFESSOR, email="d@unb.br")

    await _salvar_membros(async_database, classroom_id, [eu, docente])
    assert (await _situacoes(async_database, classroom_id))["DOCENTE"] == (None, True)
    await _salvar_membros(async_database, classroom_id, [eu])

    assert set(await _situacoes(async_database, classroom_id)) == {"Discente 0"}


async def test_alunos_de_turma_encerrada_concluem(async_database, usuarios, hoje):
    await _salvar_turmas(async_database, usuarios[0], [_turma("AAA")])
    classroom_id = (await _vinculos(async_database, usuarios[0]))[0].classroom_id
    hoje(date(2026, 12, 19))

    await _salvar_membros(
        async_database, classroom_id, [_membro("Discente 0", registration="251000000")]
    )

    assert await _situacoes(async_database, classroom_id) == {
        "Discente 0": (ClassroomStatus.CONCLUIDO, True)
    }


async def test_estatisticas_substituem_as_anteriores(async_database, usuarios):
    await _salvar_turmas(async_database, usuarios[0], [_turma("AAA")])
    classroom_id = (await _vinculos(async_database, usuarios[0]))[0].classroom_id

    for shares in (
        [StatisticsShare(situation=StudentSituation.MATRICULADO, percentage=100)],
        [
            StatisticsShare(situation=StudentSituation.APROVADO, percentage=90),
            StatisticsShare(situation=StudentSituation.MATRICULADO, percentage=10),
        ],
    ):
        async with async_database() as session:
            await ClassroomRepository(session).save_statistics(
                classroom_id, shares, AGORA
            )
            await session.commit()

    async with async_database() as session:
        statistics = await ClassroomRepository(session).get_statistics(classroom_id)
        classroom = await session.get_one(ClassroomModel, classroom_id)
    assert sorted((s["situation"], s["percentage"]) for s in statistics.data) == [
        ("aprovado", 90),
        ("matriculado", 10),
    ]
    assert classroom.statistics_synced_at is not None
    assert await _contar(async_database, ClassroomStatistic) == 1

    async with async_database() as session:
        await ClassroomRepository(session).save_statistics(classroom_id, [], AGORA)
        await session.commit()
        cached = await ClassroomRepository(session).get_statistics(classroom_id)
        assert cached.data == []
    assert await _contar(async_database, ClassroomStatistic) == 1


async def test_banco_barra_docente_duplicado_em_syncs_concorrentes(async_database):
    """Sem o índice parcial, a corrida entre dois syncs criaria o mesmo docente
    duas vezes; com ele, a segunda gravação falha e é refeita como update."""
    async with async_database() as session:
        session.add_all(
            [User(name="DOCENTE", email="d@unb.br"), User(name="D", email="d@unb.br")]
        )
        with pytest.raises(IntegrityError):
            await session.commit()

    async with async_database() as session:
        session.add_all(
            [
                User(name="DISCENTE", email="d@unb.br", registration="1"),
                User(name="DOCENTE", email="d@unb.br"),
                User(name="SEM EMAIL"),
                User(name="SEM EMAIL"),
            ]
        )
        await session.commit()
