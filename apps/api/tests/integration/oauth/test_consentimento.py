from urllib.parse import parse_qs, urlsplit

import pytest
from sigaa_client import Credentials


def test_consentimento_sobrevive_a_renovacao_da_sessao(client, autorizacao):
    _, params, _ = autorizacao
    pedido = client.get("/oauth/authorize", params=params)
    assert pedido.status_code == 200
    assert pedido.headers["cache-control"] == "no-store"
    assert client.post("/auth/sigaa/refresh").status_code == 204
    resposta = client.post(
        "/oauth/authorize",
        json={"request_token": pedido.json()["request_token"], "approved": True},
    )
    assert resposta.status_code == 200
    assert "code=" in resposta.json()["redirect_uri"]


def test_novo_login_da_mesma_conta_invalida_consentimento(client, cookies, autorizacao):
    _, params, _ = autorizacao
    token = client.get("/oauth/authorize", params=params).json()["request_token"]
    client.cookies.clear()
    client.cookies.update(
        cookies(refresh=Credentials(registration="251000000", password="senha123"))
    )
    resposta = client.post(
        "/oauth/authorize", json={"request_token": token, "approved": True}
    )
    assert resposta.status_code == 400
    assert "redirect_uri" not in resposta.json()


def test_recusa_preserva_state_e_query_sem_emitir_codigo(client, autorizacao):
    _, params, _ = autorizacao
    token = client.get("/oauth/authorize", params=params).json()["request_token"]
    resposta = client.post(
        "/oauth/authorize", json={"request_token": token, "approved": False}
    )
    assert parse_qs(urlsplit(resposta.json()["redirect_uri"]).query) == {
        "view": ["calendar"],
        "error": ["access_denied"],
        "state": [params["state"]],
    }


@pytest.mark.parametrize(
    "alteracao",
    [
        {"redirect_uri": "https://intruso.test"},
        {"client_id": "inexistente"},
        {"scope": "senha:read"},
        {"code_challenge_method": "plain"},
    ],
)
def test_pedido_invalido_nao_redireciona(client, autorizacao, alteracao):
    _, params, _ = autorizacao
    resposta = client.get("/oauth/authorize", params=params | alteracao)
    assert resposta.status_code == 400
    assert "location" not in resposta.headers
    assert "redirect_uri" not in resposta.json()
