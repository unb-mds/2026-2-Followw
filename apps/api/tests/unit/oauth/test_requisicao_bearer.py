from types import SimpleNamespace

from fastapi import Request

from api.modules.oauth.auth import is_bearer_request
from api.modules.oauth.scopes import Scope, oauth


def _requisicao(*, authorization=True, delegavel=True):
    route = SimpleNamespace(openapi_extra=oauth(Scope.PROFILE) if delegavel else None)
    headers = [(b"authorization", b"Bearer token")] if authorization else []
    return Request({"type": "http", "headers": headers, "route": route})


def test_bearer_em_rota_delegavel_e_requisicao_oauth():
    assert is_bearer_request(_requisicao())


def test_sem_authorization_ou_fora_das_rotas_delegaveis_vale_a_sessao_web():
    assert not is_bearer_request(_requisicao(authorization=False))
    assert not is_bearer_request(_requisicao(delegavel=False))
