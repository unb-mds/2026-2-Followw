from hashlib import sha256
from uuid import UUID

from sqlalchemy import select

from api.db.models import OAuthApplication

from .helpers import APPLICATIONS, REDIRECT


def test_lista_por_dono_com_cursor_e_sem_segredos(client, sessao_web, criar_aplicacao):
    owner = sessao_web()
    first = criar_aplicacao("Agenda", owner)
    second = criar_aplicacao("Calendário", owner)
    criar_aplicacao("De outro dono", sessao_web("251000001"))

    response = client.get(APPLICATIONS, params={"limit": 1}, headers=owner)
    assert response.headers["Cache-Control"] == "no-store"
    page = response.json()
    assert page == {
        "items": [
            {
                "client_id": second["client_id"],
                "name": "Calendário",
                "redirect_uris": [REDIRECT],
            }
        ],
        "next_cursor": second["client_id"],
    }
    second_page = client.get(
        APPLICATIONS, params={"limit": 1, "cursor": page["next_cursor"]}, headers=owner
    ).json()
    assert [item["client_id"] for item in second_page["items"]] == [first["client_id"]]
    assert second_page["next_cursor"] is None


def test_so_dono_edita_rotaciona_e_remove_aplicacao(
    client, database, sessao_web, criar_aplicacao
):
    owner = sessao_web()
    other = sessao_web("251000001")
    app = criar_aplicacao(owner=owner)
    client_id = UUID(app["client_id"])
    path = f"{APPLICATIONS}/{client_id}"
    rotate = f"{path}/rotate-secret"
    query = select(OAuthApplication.secret_hash).where(OAuthApplication.id == client_id)
    with database() as session:
        assert session.scalar(query) == sha256(app["client_secret"].encode()).digest()

    assert client.patch(path, json={"name": "Outro"}, headers=other).status_code == 404
    assert client.post(rotate, headers=other).status_code == 404
    assert client.delete(path, headers=other).status_code == 404
    response = client.patch(path, json={"name": " Agenda UnB "}, headers=owner)
    assert response.json() == {
        "client_id": str(client_id),
        "name": "Agenda UnB",
        "redirect_uris": [REDIRECT],
    }
    response = client.post(rotate, headers=owner)
    assert response.headers["Cache-Control"] == "no-store"
    secret = response.json()["client_secret"]
    assert secret != app["client_secret"]
    with database() as session:
        assert session.scalar(query) == sha256(secret.encode()).digest()
    assert client.delete(path, headers=owner).status_code == 204
    assert client.get(APPLICATIONS, headers=owner).json()["items"] == []


def test_gerenciamento_exige_cookie_e_bloqueia_origem_estranha(api, sessao_web):
    assert api.get(APPLICATIONS).status_code == 401
    assert (
        api.get(
            APPLICATIONS, headers={**sessao_web(), "Authorization": "Bearer qualquer"}
        ).status_code
        == 401
    )
    response = api.post(
        f"{APPLICATIONS}/01900000-0000-7000-8000-000000000001/rotate-secret",
        headers={**sessao_web(), "Origin": "https://outro.followw.app"},
    )
    assert response.status_code == 403


def test_rejeita_uris_invalidas_no_cadastro(api, sessao_web, subtests):
    session = sessao_web()
    for uris in (
        [],
        [REDIRECT, REDIRECT],
        ["//app.example/callback"],
        ["http://app.example/callback"],
        ["https://app.example/callback#"],
        ["https://user@app.example/callback"],
        ["https://*.example/callback"],
        ["https://app.example\\@other.example/callback"],
        ["https://app.example/callback?%73tate=fixo"],
        ["https://%zz/callback"],
    ):
        with subtests.test(uris=uris):
            response = api.post(
                APPLICATIONS,
                json={"name": "Agenda", "redirect_uris": uris},
                headers=session,
            )
            assert response.status_code == 422
