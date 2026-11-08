from datetime import UTC, datetime, timedelta

import pytest
from sigaa_client import (
    AuthenticationFailed,
    SigaaError,
)
from sqlalchemy import select

from api.cache import is_stale
from api.cookies import ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME
from api.db.models import User
from api.modules.me.profile import sync_profile
from api.sync.engine import Step

from .helpers import (
    CREDENCIAIS,
    NO_CACHE,
    _envelhecer,
    _gravacao_concorrente,
)


@pytest.mark.parametrize(
    "synced_at,ttl,stale",
    [
        (None, None, True),
        (None, timedelta(hours=1), True),
        (datetime.now(UTC) - timedelta(days=365), None, False),
        (datetime.now(UTC) - timedelta(minutes=30), timedelta(hours=1), False),
        (datetime.now(UTC) - timedelta(hours=2), timedelta(hours=1), True),
    ],
)
def test_regra_de_vencimento(synced_at, ttl, stale):
    assert is_stale(synced_at, ttl) is stale


def test_sem_cache_busca_no_sigaa_e_grava_para_a_proxima(logado, stub_sigaa, database):
    primeira = logado.get("/me")
    segunda = logado.get("/me")

    assert primeira.status_code == segunda.status_code == 200
    assert primeira.json() == segunda.json()
    assert stub_sigaa.profile.get_profile.await_count == 1
    with database() as session:
        assert session.scalar(select(User.profile_synced_at)) is not None


def test_cache_vencido_responde_na_hora_e_revalida_em_background(
    logado, stub_sigaa, database
):
    logado.get("/me")
    _envelhecer(database, User.profile_synced_at, hours=13)
    perfil = stub_sigaa.profile.get_profile.return_value
    stub_sigaa.profile.get_profile.return_value = perfil.model_copy(update={"ira": 4.5})

    assert logado.get("/me").json()["ira"] == 3.5
    assert logado.get("/me").json()["ira"] == 4.5
    assert stub_sigaa.profile.get_profile.await_count == 2


def test_cache_em_dia_nao_revalida(logado, stub_sigaa, database, monkeypatch):
    logado.get("/me")
    _envelhecer(database, User.profile_synced_at, hours=11)

    def criar_client(*args, **kwargs):
        pytest.fail("Cache em dia não deve construir o cliente do QStash")

    monkeypatch.setattr("api.sync.queue.AsyncQStash", criar_client)

    assert logado.get("/me").status_code == 200

    assert stub_sigaa.profile.get_profile.await_count == 1


def test_falha_na_revalidacao_nao_afeta_a_resposta(logado, stub_sigaa, database):
    logado.get("/me")
    _envelhecer(database, User.profile_synced_at, hours=13)
    stub_sigaa.profile.get_profile.side_effect = SigaaError("fora do ar")

    response = logado.get("/me")

    assert response.status_code == 200
    assert response.json()["ira"] == 3.5


def test_refresh_com_sigaa_fora_mantem_o_cache(logado, stub_sigaa, database):
    logado.get("/me")
    stub_sigaa.profile.get_profile.side_effect = SigaaError("fora do ar")

    assert logado.get("/me", headers=NO_CACHE).status_code == 502

    stub_sigaa.profile.get_profile.side_effect = None
    assert logado.get("/me").json()["ira"] == 3.5


def test_resposta_do_cache_informa_a_idade(logado, stub_sigaa, database):
    primeira = logado.get("/me")
    _envelhecer(database, User.profile_synced_at, hours=2)

    segunda = logado.get("/me")

    assert primeira.headers["cache-control"] == "private, no-cache"
    assert int(primeira.headers["age"]) < 5
    assert 7200 <= int(segunda.headers["age"]) < 7205


@pytest.mark.parametrize("max_age,revalida", [(3600, True), (86400, False)])
def test_max_age_revalida_cache_mais_velho_que_o_pedido(
    logado, stub_sigaa, database, max_age, revalida
):
    logado.get("/me")
    _envelhecer(database, User.profile_synced_at, hours=2)
    perfil = stub_sigaa.profile.get_profile.return_value
    stub_sigaa.profile.get_profile.return_value = perfil.model_copy(update={"ira": 4.5})

    response = logado.get("/me", headers={"Cache-Control": f"max-age={max_age}"})

    assert response.json()["ira"] == (4.5 if revalida else 3.5)
    assert stub_sigaa.profile.get_profile.await_count == (2 if revalida else 1)


def test_max_age_maior_que_o_ttl_nao_impede_a_revalidacao_em_background(
    logado, stub_sigaa, database
):
    logado.get("/me")
    _envelhecer(database, User.profile_synced_at, hours=13)
    perfil = stub_sigaa.profile.get_profile.return_value
    stub_sigaa.profile.get_profile.return_value = perfil.model_copy(update={"ira": 4.5})

    response = logado.get("/me", headers={"Cache-Control": "max-age=604800"})

    assert response.json()["ira"] == 3.5
    assert logado.get("/me").json()["ira"] == 4.5


@pytest.mark.parametrize(
    "header,status",
    [
        ("no-cache, stale-if-error", 200),
        ("max-age=0, stale-if-error=86400", 200),
        ("no-cache, stale-if-error=60", 502),
    ],
)
def test_stale_if_error_serve_o_cache_se_o_sigaa_falhar(
    logado, stub_sigaa, database, header, status
):
    logado.get("/me")
    _envelhecer(database, User.profile_synced_at, hours=2)
    stub_sigaa.profile.get_profile.side_effect = SigaaError("fora do ar")

    response = logado.get("/me", headers={"Cache-Control": header})

    assert response.status_code == status
    if status == 200:
        assert response.json()["ira"] == 3.5
        assert int(response.headers["age"]) >= 7200


def test_stale_if_error_serve_cache_sem_access_token_com_o_cas_fora(logado, stub_sigaa):
    logado.get("/me")
    logado.cookies.delete(ACCESS_COOKIE_NAME)
    stub_sigaa.authenticate.side_effect = SigaaError("CAS fora do ar")

    response = logado.get("/me", headers={"Cache-Control": "no-cache, stale-if-error"})

    assert response.status_code == 200


def test_stale_if_error_nao_mascara_credencial_invalida(logado, stub_sigaa):
    logado.get("/me")
    logado.cookies.delete(ACCESS_COOKIE_NAME)
    stub_sigaa.authenticate.side_effect = AuthenticationFailed("senha trocada")

    response = logado.get("/me", headers={"Cache-Control": "no-cache, stale-if-error"})

    assert response.status_code == 401


def test_only_if_cached_sem_cache_retorna_504_sem_ir_ao_sigaa(logado, stub_sigaa):
    response = logado.get("/me", headers={"Cache-Control": "only-if-cached"})

    assert response.status_code == 504
    stub_sigaa.profile.get_profile.assert_not_awaited()


def test_only_if_cached_serve_cache_vencido_e_agenda_revalidacao(
    logado, stub_sigaa, database
):
    logado.get("/me")
    _envelhecer(database, User.profile_synced_at, hours=13)
    perfil = stub_sigaa.profile.get_profile.return_value
    stub_sigaa.profile.get_profile.return_value = perfil.model_copy(update={"ira": 4.5})

    response = logado.get("/me", headers={"Cache-Control": "only-if-cached, no-cache"})

    assert response.json()["ira"] == 3.5
    assert logado.get("/me").json()["ira"] == 4.5


def test_gravacao_concorrente_responde_com_o_que_o_outro_sync_gravou(
    logado, stub_sigaa, async_database, monkeypatch
):
    _gravacao_concorrente(monkeypatch, async_database, vence=True)

    response = logado.get("/me")

    assert response.status_code == 200
    assert response.json()["ira"] == 3.5


def test_gravacao_concorrente_sem_cache_pede_nova_tentativa(
    logado, stub_sigaa, async_database, monkeypatch
):
    _gravacao_concorrente(monkeypatch, async_database, vence=False)

    assert logado.get("/me").status_code == 503


def test_cache_com_access_token_valido_nao_renova_os_cookies(
    client, stub_sigaa, cookies, ler_cookies
):
    client.cookies.update(cookies(access="app14~VIVO", refresh=CREDENCIAIS))
    primeira = client.get("/me")

    segunda = client.get("/me")

    assert ler_cookies(primeira).keys() == {ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME}
    assert segunda.status_code == 200
    assert "set-cookie" not in segunda.headers
    assert stub_sigaa.created.call_count == 1
    stub_sigaa.authenticate.assert_not_awaited()


def test_cache_sem_access_token_sai_sem_login(logado, stub_sigaa):
    logado.get("/me")
    logado.cookies.delete(ACCESS_COOKIE_NAME)

    response = logado.get("/me")

    assert response.status_code == 200
    assert "set-cookie" not in response.headers
    stub_sigaa.authenticate.assert_awaited_once()


def test_cache_vencido_sem_access_token_revalida_sem_logar_na_requisicao(
    logado, stub_sigaa, database, qstash
):
    logado.get("/me")
    _envelhecer(database, User.profile_synced_at, hours=13)
    logado.cookies.delete(ACCESS_COOKIE_NAME)
    stub_sigaa.reset()

    response = logado.get("/me")

    assert response.status_code == 200
    assert "set-cookie" not in response.headers
    assert [job.steps for job in qstash.jobs()] == [(Step.of(sync_profile),)]
    # Quem logou foi o job, numa sessão própria que ele mesmo encerrou.
    assert stub_sigaa.created.call_count == 1
    assert stub_sigaa.created.call_args.kwargs["session_token"] is None
    stub_sigaa.authenticate.assert_awaited_once()
    stub_sigaa.logout.assert_awaited_once()


def test_requisicao_usa_um_so_client_do_sigaa(logado, conta):
    # Sem cache: lê as turmas, o perfil para gravá-las e os participantes.
    response = logado.get("/classrooms/AAA/members")

    assert response.status_code == 200
    conta.profile.get_profile.assert_awaited_once()
    conta.classrooms.list_classroom_members.assert_awaited_once()
    assert conta.created.call_count == 1
    conta.aclose.assert_awaited_once()


def test_nenhuma_sessao_do_banco_fica_aberta_esperando_o_sigaa(
    client, stub_sigaa, async_database, cookies
):
    from contextlib import asynccontextmanager

    from api.db.main import get_sessionmaker

    abertas = 0

    @asynccontextmanager
    async def sessionmaker():
        nonlocal abertas
        abertas += 1
        try:
            async with async_database() as session:
                yield session
        finally:
            abertas -= 1

    durante_o_sigaa = []

    async def get_profile():
        durante_o_sigaa.append(abertas)
        return perfil

    perfil = stub_sigaa.profile.get_profile.return_value
    stub_sigaa.profile.get_profile.side_effect = get_profile
    client.app.dependency_overrides[get_sessionmaker] = lambda: sessionmaker
    client.cookies.update(cookies(refresh=CREDENCIAIS))

    client.get("/me")
    client.get("/me", headers=NO_CACHE)

    assert durante_o_sigaa == [0, 0]
