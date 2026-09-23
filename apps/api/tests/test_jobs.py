import hashlib
import logging

import httpx
import pytest
from sigaa_client import SessionExpired, SigaaError
from sqlalchemy import select

from api.db.models import User
from api.dependencies.qstash import JOBS_URL, decode_job, encode_job
from api.services.sync import Job, Task

LOGIN = {"registration": "251000000", "password": "senha"}
PERFIL = Job(task=Task.PROFILE, registration="251000000", session_token="app14~VIVO")


def _entregar(client, qstash, body: str, *, signature: str | None = None):
    signature = signature or qstash.sign(JOBS_URL, body)
    return client.post("/jobs", content=body, headers={"Upstash-Signature": signature})


def test_publica_o_job_cifrado_e_um_por_vez_por_usuario(client, sigaa, qstash):
    client.post("/auth/sigaa", json=LOGIN)

    message = qstash.published[0]
    assert message["destination"] == "https://api.followw.test/jobs"
    assert (
        message["headers"]["Upstash-Deduplication-Id"]
        == hashlib.sha256(b"251000000:account:app14~TOKEN1").hexdigest()
    )
    assert message["headers"]["Upstash-Flow-Control-Key"] == "sigaa-251000000"
    assert message["headers"]["Upstash-Flow-Control-Value"] == "parallelism=1"
    job = decode_job(message["body"].encode())
    # A Upstash não enxerga o token da sessão, e a senha nem entra no job.
    assert job.session_token not in message["body"]
    assert "senha" not in job.model_dump_json()


def test_sessao_nova_nao_cai_na_deduplicacao_da_anterior(client, sigaa, qstash):
    # O job da sessão que morreu foi descartado: o da nova precisa rodar.
    client.post("/auth/sigaa", json=LOGIN)
    client.post("/auth/sigaa", json=LOGIN)

    ids = [
        m["headers"]["Upstash-Deduplication-Id"]
        for m in qstash.published
        if decode_job(m["body"].encode()).task == Task.ACCOUNT
    ]
    assert len(set(ids)) == 2


def test_job_usa_so_o_token_da_sessao(client, stub_sigaa, qstash, database):
    response = _entregar(client, qstash, encode_job(PERFIL))

    assert response.status_code == 204
    assert stub_sigaa.created.call_args.kwargs["credentials"] is None
    assert stub_sigaa.created.call_args.kwargs["session_token"] == "app14~VIVO"
    stub_sigaa.authenticate.assert_not_awaited()
    stub_sigaa.aclose.assert_awaited_once()
    with database() as session:
        assert session.scalar(select(User.profile_synced_at)) is not None


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
        lambda qstash, body: qstash.sign(JOBS_URL, encode_job(PERFIL)),
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


@pytest.mark.parametrize(
    "erro,status",
    [
        # Sem a senha não há relogin: repetir não adianta.
        (SessionExpired("sessão morreu"), 204),
        (SigaaError("fora do ar"), 502),
        (httpx.ConnectError("fora do ar"), 502),
    ],
)
def test_so_falha_passageira_pede_nova_tentativa(
    client, stub_sigaa, qstash, database, erro, status
):
    stub_sigaa.profile.get_profile.side_effect = erro

    assert _entregar(client, qstash, encode_job(PERFIL)).status_code == status
    with database() as session:
        assert session.scalar(select(User)) is None


def test_cada_requisicao_fecha_o_proprio_client_do_qstash(
    client, sigaa, qstash, monkeypatch
):
    from api.dependencies.qstash import QStashQueue

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


def test_qstash_fora_nao_derruba_o_login(client, sigaa, qstash, caplog):
    qstash.unavailable = True

    with caplog.at_level(logging.ERROR):
        response = client.post("/auth/sigaa", json=LOGIN)

    assert response.status_code == 200
    assert "Falha ao agendar 251000000:account" in caplog.text
