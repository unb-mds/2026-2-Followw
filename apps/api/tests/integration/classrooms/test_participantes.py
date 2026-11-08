from datetime import UTC, date, datetime, timedelta

import pytest
from sigaa_client import SigaaError
from sqlalchemy import update

from api.db.models import Classroom as ClassroomModel
from api.db.models import User

from .helpers import ANTIGA, ATUAL, CREDENCIAIS, NO_CACHE, PARTICIPANTES


def test_participantes_saem_do_cache_do_login(client, sigaa, turmas):
    client.post(
        "/auth/sigaa", json={"registration": "251000000", "password": "senha123"}
    )
    lidas = turmas.classrooms.list_classroom_members.await_count

    response = client.get("/classrooms/AAA/members")

    assert response.status_code == 200
    body = response.json()
    assert [m["name"] for m in body["students"]] == ["ANA", "ZECA"]
    assert body["monitors"] == []
    assert body["professors"] == [
        {"siape": None, "name": "NOME DOCENTE", "photo": None, "email": None}
    ]
    assert body["students"][0]["registration"] == "3"
    assert body["students"][1]["course"]["name"] == "ENGENHARIA DE SOFTWARE"
    assert body["students"][1]["unit"] == {
        "id": 673,
        "code": "FCTE",
        "name": "CAMPUS UNB GAMA",
    }
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

    response = client.get("/classrooms/DE-OUTRO-ALUNO/members")
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

    assert response.json() == client.get("/classrooms/AAA/members").json()
    assert [m["name"] for m in response.json()["students"]] == ["ZECA"]
    assert response.json()["professors"] == []


def test_detalhes_com_sigaa_fora_retornam_502(client, turmas, cookies):
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    turmas.classrooms.list_classroom_members.side_effect = SigaaError("fora")

    assert client.get("/classrooms/AAA/members").status_code == 502


def test_openapi_documenta_participantes_e_estatisticas(api):
    paths = api.get("/openapi.json").json()["paths"]

    route = paths["/classrooms/{classroom_id}/members"]["get"]
    assert {"401", "404", "502"} <= route["responses"].keys()
    assert any(p["name"] == "Cache-Control" for p in route["parameters"])
    assert "/classrooms/{classroom_id}/statistics" in paths


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


def test_detalhes_revalidam_a_lista_de_turmas_vencida(client, sigaa, turmas, database):
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

    assert client.get("/classrooms/AAA/members").status_code == 200
    assert turmas.classrooms.list_classrooms.await_count == 2
    assert client.get("/classrooms/AAA/members").status_code == 404


def test_detalhes_aceitam_sigaa_id(client, turmas, cookies):
    turmas.classrooms.list_classrooms.return_value = [
        ATUAL.model_copy(update={"sigaa_id": 1614100})
    ]
    client.cookies.update(cookies(refresh=CREDENCIAIS))

    por_sigaa_id = client.get("/classrooms/1614100/members")

    assert por_sigaa_id.status_code == 200
    assert client.get("/classrooms/AAA/members").json() == por_sigaa_id.json()
    assert turmas.classrooms.list_classrooms.await_count == 1


@pytest.mark.parametrize("classroom_id", ["99999999999", "-1", "1614100.0"])
def test_sigaa_id_fora_do_formato_retorna_404(client, turmas, cookies, classroom_id):
    turmas.classrooms.list_classrooms.return_value = [
        ATUAL.model_copy(update={"sigaa_id": 1614100})
    ]
    client.cookies.update(cookies(refresh=CREDENCIAIS))

    assert client.get(f"/classrooms/{classroom_id}/members").status_code == 404


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

    assert len(client.get("/classrooms/AAA/members").json()["students"]) == 2
    assert turmas.classrooms.list_classroom_members.await_count == 1
