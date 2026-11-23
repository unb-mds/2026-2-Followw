import pytest
from fastapi import HTTPException

from api.modules.oauth.scopes import FULL_ACCESS, AccessPolicy, Scope


def test_sessao_web_tem_acesso_total_e_nao_e_delegada():
    assert not FULL_ACCESS.delegated
    assert all(FULL_ACCESS.allows(scope) for scope in Scope)


def test_acesso_delegado_so_permite_o_que_foi_concedido():
    policy = AccessPolicy(frozenset({Scope.PROFILE, Scope.POSTS}))
    assert policy.delegated
    assert {scope for scope in Scope if policy.allows(scope)} == {
        Scope.PROFILE,
        Scope.POSTS,
    }


def test_delegacao_sem_escopos_nao_vira_acesso_total():
    policy = AccessPolicy(frozenset())
    assert policy.delegated
    assert not any(policy.allows(scope) for scope in Scope)


def test_exigir_escopo_ausente_responde_403_com_desafio_bearer():
    policy = AccessPolicy(frozenset({Scope.PROFILE}))
    policy.require(Scope.PROFILE)
    with pytest.raises(HTTPException) as error:
        policy.require(Scope.GRADES)
    assert error.value.status_code == 403
    assert error.value.headers == {
        "WWW-Authenticate": 'Bearer error="insufficient_scope"'
    }
    FULL_ACCESS.require(Scope.GRADES)
