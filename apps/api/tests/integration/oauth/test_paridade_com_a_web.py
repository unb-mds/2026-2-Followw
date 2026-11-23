from datetime import datetime

import pytest
from sigaa_client import Credentials

from api.modules.oauth.scopes import Scope

ROTAS = ("/classrooms", "/classrooms/frequency", "/posts/news", "/lessons")


@pytest.mark.parametrize("rota", ROTAS)
def test_oauth_com_todos_os_escopos_da_rota_devolve_o_mesmo_da_web(
    client, emitir, cookies, noticias, hoje, rota
):
    hoje(datetime(2026, 9, 17, 15))
    credenciais = Credentials(registration="251000000", password="senha123")
    client.cookies.update(cookies(refresh=credenciais))
    client.get(rota)
    web = client.get(rota)
    client.cookies.clear()
    token = emitir(
        Scope.CLASSROOMS, Scope.GRADES, Scope.FREQUENCY, Scope.POSTS
    ).access_token
    oauth = client.get(rota, headers={"Authorization": f"Bearer {token}"})

    assert web.status_code == oauth.status_code == 200
    assert web.json()
    assert oauth.json() == web.json()
    assert oauth.headers["cache-control"] == web.headers["cache-control"]
