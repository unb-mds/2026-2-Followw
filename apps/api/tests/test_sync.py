import hashlib
import logging
from datetime import UTC, datetime, timedelta

import httpx
import pytest
import sigaa_client
from pydantic import SecretStr
from sigaa_client import (
    AuthenticationFailed,
    ClassroomMember,
    ClassroomNotFound,
    ClassroomRole,
    Credentials,
    SessionExpired,
    SigaaError,
    SigaaParseError,
    StatisticsShare,
    StudentSituation,
)
from sqlalchemy import select, update

from api.cache import is_stale
from api.cookies import ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME
from api.db.models import Classroom, ClassroomStatistic, ClassroomUser, User
from api.modules.auth.account import sync_account
from api.modules.classrooms.service import sync_members, sync_statistics
from api.modules.me.profile import sync_profile
from api.sync.engine import Job, Step
from api.sync.queue import JOBS_URL, encode_job

CREDENCIAIS = Credentials(registration="251000000", password=SecretStr("senha123"))
NO_CACHE = {"Cache-Control": "no-cache"}
LOGIN = {"registration": "251000000", "password": "senha123"}
ATUAL = sigaa_client.Classroom(
    id="AAA",
    number="01",
    semester="2026.2",
    current=True,
    subject=sigaa_client.Subject(code="FGA0146", name="ESTRUTURAS DE DADOS 1"),
)
ANTIGA = sigaa_client.Classroom(
    id="BBB",
    number="02",
    semester="2025.2",
    subject=sigaa_client.Subject(code="FGA0158", name="ORIENTAÇÃO A OBJETOS"),
)
COLEGA = ClassroomMember(name="COLEGA", role=ClassroomRole.ALUNO, registration="2")
FATIA = StatisticsShare(situation=StudentSituation.APROVADO, percentage=100)


@pytest.fixture
def conta(stub_sigaa):
    stub_sigaa.classrooms.list_classrooms.return_value = [ATUAL, ANTIGA]
    stub_sigaa.classrooms.list_classroom_members.return_value = [COLEGA]
    stub_sigaa.classrooms.get_classroom_statistics.return_value = (FATIA,)
    return stub_sigaa


@pytest.fixture
def logado(client, cookies):
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    return client


def _envelhecer(database, column, *, hours: int) -> None:
    with database() as session:
        session.execute(
            update(column.class_).values(
                {column.key: datetime.now(UTC) - timedelta(hours=hours)}
            )
        )
        session.commit()


@pytest.mark.parametrize(
    "synced_at,ttl,stale",
    [
        (None, None, True),
        (None, timedelta(hours=1), True),
        (datetime.now(UTC) - timedelta(days=365), None, False),
        (datetime.now(UTC) - timedelta(minutes=30), timedelta(hours=1), False),
        (datetime.now(UTC) - timedelta(hours=2), timedelta(hours=1), True),
        # O SQLite devolve sem fuso: vale como UTC.
        (
            datetime.now(UTC).replace(tzinfo=None) - timedelta(hours=2),
            timedelta(hours=1),
            True,
        ),
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
    _envelhecer(database, User.profile_synced_at, hours=25)
    perfil = stub_sigaa.profile.get_profile.return_value
    stub_sigaa.profile.get_profile.return_value = perfil.model_copy(update={"ira": 4.5})

    assert logado.get("/me").json()["ira"] == 3.5
    assert logado.get("/me").json()["ira"] == 4.5
    assert stub_sigaa.profile.get_profile.await_count == 2


def test_cache_em_dia_nao_revalida(logado, stub_sigaa, database):
    logado.get("/me")
    _envelhecer(database, User.profile_synced_at, hours=23)

    logado.get("/me")

    assert stub_sigaa.profile.get_profile.await_count == 1


def test_falha_na_revalidacao_nao_afeta_a_resposta(logado, stub_sigaa, database):
    logado.get("/me")
    _envelhecer(database, User.profile_synced_at, hours=25)
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
    _envelhecer(database, User.profile_synced_at, hours=25)
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
    _envelhecer(database, User.profile_synced_at, hours=25)
    perfil = stub_sigaa.profile.get_profile.return_value
    stub_sigaa.profile.get_profile.return_value = perfil.model_copy(update={"ira": 4.5})

    response = logado.get("/me", headers={"Cache-Control": "only-if-cached, no-cache"})

    assert response.json()["ira"] == 3.5
    assert logado.get("/me").json()["ira"] == 4.5


def _gravacao_concorrente(monkeypatch, async_database, *, vence: bool) -> None:
    """Toda gravação do perfil esbarra na de outro sync; com `vence`, a outra commita."""
    from sqlalchemy.exc import IntegrityError

    from api.modules.me.repository import UserRepository

    save_profile = UserRepository.save_profile

    async def concorrente(self, profile, now):
        if vence:
            async with async_database() as session:
                await save_profile(UserRepository(session), profile, now)
                await session.commit()
        raise IntegrityError("INSERT INTO users", {}, Exception("unique"))

    monkeypatch.setattr(UserRepository, "save_profile", concorrente)


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
    _envelhecer(database, User.profile_synced_at, hours=25)
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


def test_primeiro_login_sincroniza_tudo(client, conta, database):
    assert client.post("/auth/sigaa", json=LOGIN).status_code == 200

    with database() as session:
        user = session.scalar(select(User).where(User.registration == "251000000"))
        classrooms = list(session.scalars(select(Classroom)))
        assert user.profile_synced_at and user.classrooms_synced_at
        assert len(classrooms) == 2
        assert all(c.members_synced_at and c.statistics_synced_at for c in classrooms)
        assert session.scalar(select(User).where(User.registration == "2"))
        assert len(list(session.scalars(select(ClassroomStatistic)))) == 2
    lidas = conta.classrooms.list_classroom_members.await_args_list
    assert sorted(c.args for c in lidas) == [("AAA",), ("BBB",)]


def test_novo_login_so_revalida_o_que_venceu(client, conta, database):
    client.post("/auth/sigaa", json=LOGIN)
    _envelhecer(database, User.profile_synced_at, hours=23)
    _envelhecer(database, User.classrooms_synced_at, hours=73)
    _envelhecer(database, Classroom.members_synced_at, hours=25)

    client.post("/auth/sigaa", json=LOGIN)

    # Perfil em dia, turmas vencidas; detalhes só revalidam na turma atual.
    assert conta.profile.get_profile.await_count == 1
    assert conta.classrooms.list_classrooms.await_count == 2
    assert conta.classrooms.list_classroom_members.await_count == 3
    assert conta.classrooms.list_classroom_members.await_args.args == ("AAA",)


def test_segundo_aluno_aproveita_as_turmas_ja_sincronizadas(client, conta, database):
    client.post("/auth/sigaa", json=LOGIN)
    perfil = conta.profile.get_profile.return_value
    conta.profile.get_profile.return_value = perfil.model_copy(
        update={"registration": "251000001"}
    )

    client.post("/auth/sigaa", json={**LOGIN, "registration": "251000001"})

    assert conta.classrooms.list_classroom_members.await_count == 2
    assert conta.classrooms.get_classroom_statistics.await_count == 2
    with database() as session:
        assert len(list(session.scalars(select(Classroom)))) == 2
        # Dois vínculos de cada aluno e o colega nas duas turmas.
        assert len(list(session.scalars(select(ClassroomUser)))) == 6


@pytest.mark.parametrize(
    "erro",
    [
        SigaaParseError("layout mudou"),
        SessionExpired("contexto perdido"),
        httpx.ReadTimeout("SIGAA lento"),
    ],
)
def test_turma_com_falha_nao_impede_o_sync_das_outras(
    client, conta, database, qstash, erro
):
    async def members(classroom_id: str) -> list[ClassroomMember]:
        if classroom_id == "AAA":
            raise erro
        return [COLEGA]

    conta.classrooms.list_classroom_members.side_effect = members

    client.post("/auth/sigaa", json=LOGIN)

    with database() as session:
        synced = dict(
            session.execute(
                select(ClassroomUser.front_end_id, Classroom.members_synced_at).join(
                    Classroom
                )
            ).all()
        )
    # A que falhou fica sem data: tentou de novo uma vez e o próximo sync refaz.
    assert synced["AAA"] is None
    assert synced["BBB"] is not None
    lidas = [c.args for c in conta.classrooms.list_classroom_members.await_args_list]
    assert sorted(lidas) == [("AAA",), ("AAA",), ("BBB",)]
    assert {r.status_code for r in qstash.deliveries} == {204}
    estatisticas = conta.classrooms.get_classroom_statistics.await_args_list
    assert sorted(c.args for c in estatisticas) == [("AAA",), ("BBB",)]


def test_login_sincroniza_cada_turma_em_um_job(client, conta, qstash):
    client.post("/auth/sigaa", json=LOGIN)

    conta_job, *turmas = qstash.jobs()
    telas = (Step.of(sync_members), Step.of(sync_statistics))
    assert (conta_job.classroom_id, conta_job.steps) == (None, (Step.of(sync_account),))
    assert sorted((job.classroom_id, job.steps) for job in turmas) == [
        ("AAA", telas),
        ("BBB", telas),
    ]
    # O login do usuário e uma sessão para cada job, encerrada no fim dele.
    assert conta.authenticate.await_count == 4
    assert conta.logout.await_count == 3


def test_login_nao_espera_o_sync(client, conta):
    conta.profile.get_profile.side_effect = SigaaError("fora do ar")

    response = client.post("/auth/sigaa", json=LOGIN)

    assert response.status_code == 200


PERFIL = Job(credentials=CREDENCIAIS, steps=(Step.of(sync_profile),))
TELAS = Job(
    credentials=CREDENCIAIS,
    classroom_id="AAA",
    steps=(Step.of(sync_members), Step.of(sync_statistics)),
)


def _entregar(client, qstash, body: str, *, signature: str | None = None):
    signature = signature or qstash.sign(JOBS_URL, body)
    return client.post("/jobs", content=body, headers={"Upstash-Signature": signature})


@pytest.fixture
def turma(client, stub_sigaa, cookies, qstash, database):
    """Usuário com a turma AAA no cache e nenhum job pendente."""
    stub_sigaa.classrooms.list_classrooms.return_value = [ATUAL]
    stub_sigaa.classrooms.get_classroom_statistics.return_value = (FATIA,)
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    assert client.get("/classrooms").status_code == 200
    client.cookies.clear()
    qstash.published.clear()
    stub_sigaa.reset()
    return stub_sigaa


def test_login_publica_o_sync_da_conta_cifrado(client, stub_sigaa, qstash):
    client.post("/auth/sigaa", json=LOGIN)

    [message] = qstash.published
    [job] = qstash.jobs()
    assert message["destination"] == "https://api.followw.test/jobs"
    assert job.steps == (Step(task="sync_account"),)
    assert job.credentials == CREDENCIAIS
    # A Upstash não lê a credencial: ela só existe decifrada na própria API.
    assert "senha123" not in message["body"]
    assert "251000000" not in message["body"]
    assert (
        message["headers"]["Upstash-Deduplication-Id"]
        == hashlib.sha256(b"251000000:sync_account:#1").hexdigest()
    )
    assert message["headers"]["Upstash-Flow-Control-Key"] == "sigaa-251000000"
    assert message["headers"]["Upstash-Flow-Control-Value"] == "parallelism=4"
    assert "Upstash-Delay" not in message["headers"]


def test_job_loga_numa_sessao_propria_e_sai_no_fim(
    client, stub_sigaa, qstash, database
):
    response = _entregar(client, qstash, encode_job(PERFIL))

    assert response.status_code == 204
    assert stub_sigaa.created.call_args.kwargs["credentials"] == CREDENCIAIS
    assert stub_sigaa.created.call_args.kwargs["session_token"] is None
    stub_sigaa.authenticate.assert_awaited_once()
    stub_sigaa.logout.assert_awaited_once()
    stub_sigaa.aclose.assert_awaited_once()
    with database() as session:
        assert session.scalar(select(User.profile_synced_at)) is not None


def test_job_nao_usa_a_sessao_do_usuario(client, sigaa, qstash):
    """O usuário segue logado com a sessão dele; a do job morre no fim do job."""
    response = client.post("/auth/sigaa", json=LOGIN)

    assert response.status_code == 200
    # O login do usuário e o do sync da conta, que já saiu.
    assert (sigaa.logins, sigaa.logouts) == (2, 1)
    assert sigaa.valid_tokens == {"app14~TOKEN1"}


def test_sessao_do_job_sai_mesmo_quando_a_tarefa_falha(client, stub_sigaa, qstash):
    stub_sigaa.profile.get_profile.side_effect = SigaaError("fora do ar")

    _entregar(client, qstash, encode_job(PERFIL))

    assert stub_sigaa.logout.await_count == 2  # o job e a retentativa
    assert stub_sigaa.aclose.await_count == 2


def test_tarefa_que_falha_na_origem_tem_uma_unica_retentativa(
    client, turma, qstash, database
):
    turma.classrooms.list_classroom_members.side_effect = SigaaError("fora do ar")

    response = _entregar(client, qstash, encode_job(TELAS))

    assert response.status_code == 204
    # A outra tarefa da turma não espera pela que falhou.
    turma.classrooms.get_classroom_statistics.assert_awaited_once()
    [retry] = qstash.jobs()
    assert (retry.classroom_id, retry.steps, retry.attempt) == (
        "AAA",
        (Step.of(sync_members),),
        2,
    )
    assert qstash.published[0]["headers"]["Upstash-Delay"] == "60s"
    # A retentativa também falhou e não gerou uma terceira.
    assert turma.classrooms.list_classroom_members.await_count == 2
    assert [r.status_code for r in qstash.deliveries] == [204]
    with database() as session:
        classroom = session.scalar(select(Classroom))
        assert classroom.members_synced_at is None
        assert classroom.statistics_synced_at is not None


def test_retentativa_nao_cai_na_deduplicacao_da_primeira(client, turma, qstash):
    turma.classrooms.list_classroom_members.side_effect = SigaaError("fora do ar")

    _entregar(client, qstash, encode_job(TELAS))

    retry = qstash.published[0]["headers"]["Upstash-Deduplication-Id"]
    assert retry == hashlib.sha256(b"251000000:AAA:sync_members:#2").hexdigest()


@pytest.mark.parametrize(
    "erro", [SigaaError("CAS fora do ar"), httpx.ConnectError("fora do ar")]
)
def test_login_do_job_com_sigaa_fora_reagenda_todas_as_tarefas(
    client, turma, qstash, erro
):
    turma.authenticate.side_effect = erro

    _entregar(client, qstash, encode_job(TELAS))

    [retry] = qstash.jobs()
    assert (retry.steps, retry.attempt) == (TELAS.steps, 2)
    turma.classrooms.list_classroom_members.assert_not_awaited()


def test_senha_recusada_no_job_descarta_sem_retentativa(client, turma, qstash):
    turma.authenticate.side_effect = AuthenticationFailed("senha trocada")

    response = _entregar(client, qstash, encode_job(TELAS))

    assert response.status_code == 204
    assert qstash.published == []
    turma.classrooms.list_classroom_members.assert_not_awaited()


def test_tarefa_de_turma_que_sumiu_do_sigaa_e_descartada(
    client, turma, qstash, database
):
    turma.classrooms.list_classroom_members.side_effect = ClassroomNotFound("sumiu")

    assert _entregar(client, qstash, encode_job(TELAS)).status_code == 204
    assert qstash.published == []
    turma.classrooms.get_classroom_statistics.assert_awaited_once()


def test_job_de_turma_fora_da_lista_nao_busca_nada(client, turma, qstash):
    job = TELAS.model_copy(update={"classroom_id": "ZZZ"})

    assert _entregar(client, qstash, encode_job(job)).status_code == 204
    turma.classrooms.list_classroom_members.assert_not_awaited()
    turma.logout.assert_awaited_once()


def test_requisicao_junta_as_tarefas_num_job_por_turma(
    client, turma, cookies, qstash, database
):
    """A lista vencida vai no job da conta; a tela da turma, no job da turma."""
    client.cookies.update(cookies(refresh=CREDENCIAIS))
    client.get("/classrooms/AAA/statistics")
    vencido = datetime.now(UTC) - timedelta(days=30)
    with database() as session:
        session.execute(update(User).values(classrooms_synced_at=vencido))
        session.execute(update(Classroom).values(statistics_synced_at=vencido))
        session.commit()
    qstash.published.clear()

    client.get("/classrooms/AAA/statistics")

    jobs = {job.classroom_id: job.steps for job in qstash.jobs()}
    assert jobs == {
        None: (Step(task="sync_classrooms"),),
        "AAA": (Step.of(sync_statistics),),
    }


def test_job_com_tarefa_desconhecida_retorna_400(client, stub_sigaa, qstash):
    job = PERFIL.model_copy(update={"steps": (Step(task="apagar_tudo"),)})

    assert _entregar(client, qstash, encode_job(job)).status_code == 400
    stub_sigaa.created.assert_not_called()


def test_aceita_a_proxima_chave_de_assinatura(client, stub_sigaa, qstash):
    body = encode_job(PERFIL)
    signature = qstash.sign(
        JOBS_URL, body, key="sig_proxima_de_teste_com_32_bytes_ou_mais"
    )

    assert _entregar(client, qstash, body, signature=signature).status_code == 204


@pytest.mark.parametrize(
    "assinar",
    [
        lambda qstash, body: qstash.sign(
            JOBS_URL, body, key="sig_de_outra_conta_com_32_bytes_ou_mais"
        ),
        lambda qstash, body: qstash.sign("https://outra.api/jobs", body),
        lambda qstash, body: qstash.sign(JOBS_URL, encode_job(TELAS)),
    ],
    ids=["outra-chave", "outra-url", "outro-corpo"],
)
def test_job_sem_a_assinatura_do_qstash_retorna_401(
    client, stub_sigaa, qstash, assinar
):
    body = encode_job(PERFIL)

    response = _entregar(client, qstash, body, signature=assinar(qstash, body))

    assert response.status_code == 401
    stub_sigaa.created.assert_not_called()


def test_job_que_nao_decifra_retorna_400(client, stub_sigaa, qstash):
    assert _entregar(client, qstash, "nao-e-um-job").status_code == 400
    stub_sigaa.created.assert_not_called()


def test_cada_requisicao_fecha_o_proprio_client_do_qstash(
    client, stub_sigaa, qstash, monkeypatch
):
    from api.sync.queue import QStashQueue

    fechadas = []
    aclose = QStashQueue.aclose

    async def registrar(queue):
        fechadas.append(queue)
        await aclose(queue)

    monkeypatch.setattr(QStashQueue, "aclose", registrar)

    # O login e a entrega do job dele.
    client.post("/auth/sigaa", json=LOGIN)

    assert len(fechadas) == 2 and fechadas[0] is not fechadas[1]
    assert all(queue._client.http._client.is_closed for queue in fechadas)


def test_qstash_fora_nao_derruba_o_login(client, stub_sigaa, qstash, caplog):
    qstash.unavailable = True

    with caplog.at_level(logging.ERROR):
        response = client.post("/auth/sigaa", json=LOGIN)

    assert response.status_code == 200
    assert "Falha ao agendar 251000000:sync_account:#1" in caplog.text
