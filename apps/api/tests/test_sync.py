from datetime import UTC, datetime, timedelta

import httpx
import pytest
import sigaa_client
from pydantic import SecretStr
from sigaa_client import (
    AuthenticationFailed,
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
from api.services.sync import is_stale
from api.utils.session import ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME

CREDENCIAIS = Credentials(registration="251000000", password=SecretStr("senha"))
LOGIN = {"registration": "251000000", "password": "senha"}
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


def test_resposta_do_cache_renova_os_cookies(client, stub_sigaa, cookies, ler_cookies):
    client.cookies.update(cookies(access="app14~VIVO", refresh=CREDENCIAIS))
    client.get("/me")

    response = client.get("/me")

    assert stub_sigaa.profile.get_profile.await_count == 1
    assert ler_cookies(response).keys() == {ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME}


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
    "erro",
    [
        SigaaParseError("layout mudou"),
        SessionExpired("contexto perdido"),
        httpx.ReadTimeout("SIGAA lento"),
    ],
)
def test_turma_com_falha_nao_impede_o_sync_das_outras(
    client, sigaa, conta, database, erro
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
    # A que falhou fica sem data e é tentada de novo no próximo sync.
    assert synced["AAA"] is None
    assert synced["BBB"] is not None
    estatisticas = conta.classrooms.get_classroom_statistics.await_args_list
    assert sorted(c.args for c in estatisticas) == [("AAA",), ("BBB",)]


def test_senha_recusada_interrompe_o_sync_das_turmas(client, sigaa, conta):
    conta.classrooms.list_classroom_members.side_effect = AuthenticationFailed()

    client.post("/auth/sigaa", json=LOGIN)

    assert conta.classrooms.list_classroom_members.await_count == 1
    conta.classrooms.get_classroom_statistics.assert_not_awaited()


def test_login_nao_espera_o_sync(client, sigaa, conta):
    conta.profile.get_profile.side_effect = SigaaError("fora do ar")

    response = client.post("/auth/sigaa", json=LOGIN)

    assert response.status_code == 200
