import httpx
import pytest

from api.db.models import User
from api.main import app

from .helpers import deliver, profile_job


def test_job_anterior_a_exclusao_nao_consulta_sigaa(
    client, conta, qstash, stub_sigaa, database
):
    old = profile_job()
    assert client.delete("/me/data").status_code == 204
    assert deliver(client, qstash, old).status_code == 204
    stub_sigaa.created.assert_not_called()
    with database() as session:
        assert session.get(User, conta.user).ira is None


def test_job_em_execucao_nao_regrava_depois_da_exclusao(
    client, conta, qstash, stub_sigaa, database
):
    profile = stub_sigaa.profile.get_profile.return_value
    jar = dict(client.cookies)

    async def delete_during_fetch():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://testserver",
            cookies=jar,
        ) as concurrent:
            assert (await concurrent.delete("/me/data")).status_code == 204
        return profile

    stub_sigaa.profile.get_profile.side_effect = delete_during_fetch
    assert deliver(client, qstash, profile_job()).status_code == 204
    with database() as session:
        assert session.get(User, conta.user).ira is None
        assert session.get(User, conta.user).profile_synced_at is None


def test_sessao_existente_pode_recoletar_sem_reativar_jobs_antigos(
    client, conta, qstash, stub_sigaa, database
):
    old = profile_job()
    assert client.delete("/me/data").status_code == 204
    assert client.get("/me").status_code == 200
    stub_sigaa.reset()
    assert deliver(client, qstash, old).status_code == 204
    stub_sigaa.created.assert_not_called()
    with database() as session:
        assert session.get(User, conta.user).ira == 3.5


def test_exclusao_nao_bloqueia_sincronizacao_dos_colegas(
    client, conta, cookies, stub_sigaa
):
    from sigaa_client import Credentials

    assert client.delete("/me/data").status_code == 204
    profile = stub_sigaa.profile.get_profile.return_value
    stub_sigaa.profile.get_profile.return_value = profile.model_copy(
        update={"registration": "251000001"}
    )
    client.cookies.update(
        cookies(refresh=Credentials(registration="251000001", password="senha123"))
    )
    assert client.get("/me").status_code == 200


def test_novo_login_nao_cai_na_deduplicacao_dos_jobs_anteriores(
    client, stub_sigaa, qstash
):
    body = {"registration": "251000000", "password": "senha123"}
    assert client.post("/auth/sigaa", json=body).status_code == 200
    first = qstash.published[0]["headers"]["Upstash-Deduplication-Id"]
    assert client.delete("/me/data").status_code == 204
    qstash.published.clear()
    assert client.post("/auth/sigaa", json=body).status_code == 200
    second = qstash.published[0]["headers"]["Upstash-Deduplication-Id"]
    assert second != first
    assert client.get("/me").json()["ira"] == 3.5


def test_job_sem_data_de_criacao_nao_pode_restaurar_dados(
    client, conta, qstash, stub_sigaa
):
    from api.sync.queue import _cipher

    body = (
        _cipher()
        .encrypt(profile_job().model_dump_json(exclude={"created_at"}).encode())
        .decode()
    )
    assert client.delete("/me/data").status_code == 204
    response = client.post(
        "/jobs",
        content=body,
        headers={
            "Upstash-Signature": qstash.sign("https://api.followw.test/jobs", body)
        },
    )
    assert response.status_code == 400
    stub_sigaa.created.assert_not_called()


@pytest.mark.parametrize(
    ("path", "phase"),
    [
        ("/auth/sigaa", "authentication"),
        ("/auth/sigaa/refresh", "authentication"),
        ("/auth/sigaa", "rate_limit"),
    ],
)
def test_autenticacao_em_andamento_nao_restaura_dados_excluidos(
    client, conta, qstash, stub_sigaa, database, monkeypatch, path, phase
):
    jar = dict(client.cookies)

    async def delete_during_login(*args):
        stub_sigaa.authenticate.side_effect = None
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://testserver",
            cookies=jar,
        ) as concurrent:
            assert (await concurrent.delete("/me/data")).status_code == 204
        return "app14~STUB"

    if phase == "authentication":
        stub_sigaa.authenticate.side_effect = delete_during_login
    else:
        monkeypatch.setattr(
            "api.modules.auth.router.limit_registration", delete_during_login
        )
    kwargs = (
        {"json": {"registration": "251000000", "password": "senha123"}}
        if path == "/auth/sigaa"
        else {}
    )
    assert client.post(path, **kwargs).status_code == 409
    assert not qstash.published
    with database() as session:
        user = session.get(User, conta.user)
        assert user.ira is None
        assert user.profile_synced_at is None
        assert user.registered_at is None
