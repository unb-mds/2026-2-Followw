from datetime import UTC, date, datetime, timedelta
from uuid import UUID

import pytest
import sigaa_client
from pydantic import SecretStr
from sigaa_client import (
    Classroom,
    ClassroomMember,
    ClassroomRole,
    Credentials,
    Grade,
    SigaaError,
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
    UserLevel,
)
from api.db.models import Classroom as ClassroomModel
from api.db.models import (
    ClassroomStatistic,
    ClassroomUser,
    User,
)
from api.db.models import Subject as SubjectModel
from api.modules.classrooms.repository import ClassroomRepository

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
