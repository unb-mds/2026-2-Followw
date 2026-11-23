def test_preflight_de_aplicativo_externo_permite_bearer_e_dpop_sem_cookies(api):
    for path, method, header in (
        ("/me", "GET", "authorization"),
        ("/oauth/token", "POST", "dpop"),
    ):
        response = api.options(
            path,
            headers={
                "Origin": "https://agenda.example",
                "Access-Control-Request-Method": method,
                "Access-Control-Request-Headers": header,
            },
        )
        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == "*"
        assert "access-control-allow-credentials" not in response.headers


def test_origem_externa_nao_recebe_resposta_com_cookies(client, emitir, stub_sigaa):
    token = emitir().access_token
    headers = {"Origin": "https://agenda.example", "Authorization": f"Bearer {token}"}
    assert (
        client.get("/me", headers=headers).headers["access-control-allow-origin"] == "*"
    )
    client.cookies.set("refresh_token", "cookie")
    assert (
        "access-control-allow-origin" not in client.get("/me", headers=headers).headers
    )


def test_origem_do_followw_pode_enviar_credenciais_apos_preflight_com_authorization(
    api,
):
    origin = "https://followw.app"
    response = api.options(
        "/me",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin
    assert response.headers["access-control-allow-credentials"] == "true"


def test_token_externo_sem_dpop_mantem_cors_para_expor_erro_oauth(api):
    response = api.post(
        "/oauth/token",
        data={
            "grant_type": "refresh_token",
            "client_id": "agenda",
            "refresh_token": "qualquer",
        },
        headers={"Origin": "https://agenda.example"},
    )
    assert response.status_code == 400
    assert response.json() == {"error": "invalid_dpop_proof"}
    assert response.headers["access-control-allow-origin"] == "*"
    assert "access-control-allow-credentials" not in response.headers
