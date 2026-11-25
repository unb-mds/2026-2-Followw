def test_autorizacao_rejeita_parametro_repetido(client, autorizacao):
    _, params, _ = autorizacao
    query = list(params.items()) + [("state", "outro")]
    resposta = client.get("/oauth/authorize", params=query)
    assert resposta.status_code == 400
    assert resposta.json() == {"error": "invalid_request"}
    assert "redirect_uri" not in resposta.json()


def test_token_rejeita_parametro_repetido(client):
    resposta = client.post(
        "/oauth/token",
        data={
            "grant_type": "refresh_token",
            "client_id": ["agenda", "agenda"],
            "refresh_token": "x",
        },
    )
    assert resposta.status_code == 400
    assert resposta.json() == {"error": "invalid_request"}
    assert resposta.headers["cache-control"] == "no-store"


def test_parametro_desconhecido_repetido_e_ignorado(client):
    resposta = client.post(
        "/oauth/token",
        data={
            "grant_type": "refresh_token",
            "client_id": "agenda",
            "refresh_token": "x",
            "extra": ["a", "b"],
        },
    )
    assert resposta.json() == {"error": "invalid_client"}
