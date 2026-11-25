import asyncio
from datetime import UTC, datetime, timedelta

from sigaa_client import Credentials
from sqlalchemy import update

from api.db.models import OAuthGrant, User
from api.modules.classrooms.service import sync_classrooms
from api.modules.oauth.scopes import Scope
from api.sync.engine import Step


def test_agenda_vencida_segue_o_cache_da_web_e_recusa_historico(
    client, sigaa, emitir, database, qstash
):
    pair = emitir(Scope.CLASSROOMS)
    headers = {"Authorization": f"Bearer {pair.access_token}"}
    assert client.get("/lessons", headers=headers).status_code == 200
    with database.begin() as session:
        session.execute(
            update(User).values(
                classrooms_synced_at=datetime.now(UTC) - timedelta(days=7)
            )
        )
    qstash.published.clear()
    agenda = client.get("/lessons", headers=headers)
    assert agenda.status_code == 200 and len(agenda.json()) == 7
    assert Step.of(sync_classrooms) in {s for job in qstash.jobs() for s in job.steps}

    consultas = sigaa.classrooms_requests
    fresca = client.get("/lessons", headers={**headers, "Cache-Control": "no-cache"})
    assert fresca.status_code == 200
    assert sigaa.classrooms_requests > consultas
    assert not fresca.cookies
    assert client.post("/me/transcript", headers=headers).status_code == 403


def test_perfil_basico_e_desempenho_tem_campos_distintos(client, stub_sigaa, emitir):
    basic = emitir()
    full = emitir(Scope.CLASSROOMS, Scope.GRADES)
    for grant, fields in ((basic, set()), (full, {"ira", "mp"})):
        response = client.get(
            "/me", headers={"Authorization": f"Bearer {grant.access_token}"}
        )
        assert response.status_code == 200
        assert (
            set(response.json()) == {"name", "registration", "course", "photo"} | fields
        )


def test_revogacao_bloqueia_cache_e_preserva_outro_aplicativo(
    client, stub_sigaa, emitir, revogar
):
    agenda, ru = emitir(), emitir(client_id="ru")

    def perfil(token):
        return client.get("/me", headers={"Authorization": f"Bearer {token}"})

    assert perfil(agenda.access_token).status_code == 200
    asyncio.run(revogar(agenda.grant_id, "250000001"))
    assert perfil(agenda.access_token).status_code == 200
    asyncio.run(revogar(agenda.grant_id))
    assert perfil(agenda.access_token).status_code == 401
    assert perfil(ru.access_token).status_code == 200


def test_bearer_invalido_ou_sem_permissao_nao_recai_nos_cookies(
    client, cookies, emitir
):
    client.cookies.update(
        cookies(refresh=Credentials(registration="251000000", password="senha123"))
    )
    pair = emitir()
    for token in ("invalido", pair.refresh_token, client.cookies["refresh_token"]):
        assert (
            client.get("/me", headers={"Authorization": f"Bearer {token}"}).status_code
            == 401
        )
    headers = {"Authorization": f"Bearer {pair.access_token}"}
    for path in ("/me/settings", "/me/ru-token", "/classrooms"):
        assert client.get(path, headers=headers).status_code == 403
    assert client.post("/auth/sigaa/refresh", headers=headers).status_code == 403
    assert client.post("/me/student-card", headers=headers).status_code == 403


def test_concessao_vencida_ou_salt_trocado_invalida_access(client, emitir, database):
    pair = emitir()
    headers = {"Authorization": f"Bearer {pair.access_token}"}
    with database.begin() as session:
        grant = session.get(OAuthGrant, pair.grant_id)
        salt = grant.salt
        grant.salt = bytes(32)
    assert client.get("/me", headers=headers).status_code == 401
    with database.begin() as session:
        grant = session.get(OAuthGrant, pair.grant_id)
        grant.salt = salt
        grant.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    assert client.get("/me", headers=headers).status_code == 401


def test_falha_de_credencial_oauth_sinaliza_bearer_sem_apagar_cookies(
    client, sigaa, emitir
):
    pair = emitir()
    sigaa.password = "alterada"
    response = client.get(
        "/me", headers={"Authorization": f"Bearer {pair.access_token}"}
    )
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == 'Bearer error="invalid_token"'
    assert "set-cookie" not in response.headers
