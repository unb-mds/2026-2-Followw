import asyncio
from types import SimpleNamespace

from fastapi import Request, Response

from api.modules.oauth.scopes import Scope, oauth
from api.sigaa import get_sigaa_connection


def _requisicao(token):
    return Request(
        {
            "type": "http",
            "method": "GET",
            "headers": [(b"authorization", f"Bearer {token}".encode())],
            "route": SimpleNamespace(openapi_extra=oauth(Scope.PROFILE)),
        }
    )


def test_conexao_bearer_carrega_so_os_escopos_do_aceite(db, emitir):
    pair = emitir(Scope.POSTS)

    async def abrir():
        gerador = get_sigaa_connection(_requisicao(pair.access_token), Response(), db)
        connection = await anext(gerador)
        await gerador.aclose()
        return connection

    access = asyncio.run(abrir()).access
    assert access.delegated
    assert access.scopes == {Scope.PROFILE, Scope.POSTS}
    assert not access.allows(Scope.GRADES)
