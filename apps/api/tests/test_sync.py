from datetime import UTC, datetime, timedelta

import httpx
import pytest
import sigaa_client
from pydantic import SecretStr
from sigaa_client import (
    ClassroomMember,
    ClassroomRole,
    Credentials,
    SessionExpired,
    SigaaError,
    SigaaParseError,
    StatisticsShare,
    StudentSituation,
)
from sqlalchemy import select, update

from api.db.models import Classroom, ClassroomStatistic, ClassroomUser, User
from api.dependencies.qstash import JOBS_URL, decode_job, encode_job
from api.services.sync import Job, Task, is_stale
from api.utils.session import ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME

CREDENCIAIS = Credentials(registration="251000000", password=SecretStr("senha123"))
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

    assert logado.get("/me", params={"refresh": "true"}).status_code == 502

    stub_sigaa.profile.get_profile.side_effect = None
    assert logado.get("/me").json()["ira"] == 3.5


def _gravacao_concorrente(monkeypatch, async_database, *, vence: bool) -> None:
    """Toda gravação do perfil esbarra na de outro sync; com `vence`, a outra commita."""
    from sqlalchemy.exc import IntegrityError

    from api.repositories.user import UserRepository

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


def test_cache_sem_access_token_so_sai_depois_do_login(logado, stub_sigaa, ler_cookies):
    logado.get("/me")
    logado.cookies.delete(ACCESS_COOKIE_NAME)

    response = logado.get("/me")

    assert response.status_code == 200
    assert ler_cookies(response).keys() == {ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME}
    assert stub_sigaa.authenticate.await_count == 2
    assert stub_sigaa.profile.get_profile.await_count == 1


def test_senha_trocada_desloga_quando_o_access_token_vence(client, sigaa, ler_cookies):
    client.post("/auth/sigaa", json=LOGIN)
    client.cookies.delete(ACCESS_COOKIE_NAME)
    sigaa.password = "senha-nova"

    response = client.get("/me")

    assert response.status_code == 401
    jar = ler_cookies(response)
    assert {nome: jar[nome].value for nome in jar} == {
        ACCESS_COOKIE_NAME: "",
        REFRESH_COOKIE_NAME: "",
    }


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
    client.get("/me", params={"refresh": "true"})

    assert durante_o_sigaa == [0, 0]


def test_primeiro_login_sincroniza_tudo(client, sigaa, conta, database):
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


def test_novo_login_so_revalida_o_que_venceu(client, sigaa, conta, database):
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


def test_segundo_aluno_aproveita_as_turmas_ja_sincronizadas(
    client, sigaa, conta, database
):
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
    "erro,status",
    [
        (SigaaParseError("layout mudou"), 502),
        # Sem a senha o job não reloga: é descartado, sem nova tentativa.
        (SessionExpired("contexto perdido"), 204),
        (httpx.ReadTimeout("SIGAA lento"), 502),
    ],
)
def test_turma_com_falha_nao_impede_o_sync_das_outras(
    client, sigaa, conta, database, qstash, erro, status
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
    # A que falhou fica sem data: o QStash tenta de novo ou o próximo sync refaz.
    assert synced["AAA"] is None
    assert synced["BBB"] is not None
    assert sorted(r.status_code for r in qstash.deliveries) == sorted(
        [status] + [204] * 4
    )
    estatisticas = conta.classrooms.get_classroom_statistics.await_args_list
    assert sorted(c.args for c in estatisticas) == [("AAA",), ("BBB",)]


def test_login_sincroniza_cada_tela_de_turma_em_um_job(client, sigaa, conta, qstash):
    client.post("/auth/sigaa", json=LOGIN)

    jobs = [decode_job(message["body"].encode()) for message in qstash.published]
    assert jobs[0].task == Task.ACCOUNT
    assert sorted((job.task, job.classroom_id) for job in jobs[1:]) == [
        (Task.MEMBERS, "AAA"),
        (Task.MEMBERS, "BBB"),
        (Task.STATISTICS, "AAA"),
        (Task.STATISTICS, "BBB"),
    ]
    assert {job.session_token for job in jobs} == {"app14~TOKEN1"}


def test_job_de_turma_fora_da_lista_nao_busca_nada(logado, conta, qstash):
    logado.get("/classrooms")
    job = Job(
        task=Task.MEMBERS,
        registration="251000000",
        session_token="app14~STUB",
        classroom_id="ZZZ",
    )
    body = encode_job(job)

    response = logado.post(
        "/jobs",
        content=body,
        headers={"Upstash-Signature": qstash.sign(JOBS_URL, body)},
    )

    assert response.status_code == 204
    conta.classrooms.list_classroom_members.assert_not_awaited()


def test_login_nao_espera_o_sync(client, sigaa, conta):
    conta.profile.get_profile.side_effect = SigaaError("fora do ar")

    response = client.post("/auth/sigaa", json=LOGIN)

    assert response.status_code == 200
