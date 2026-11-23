import asyncio

import pytest
from sigaa_client import Credentials
from sqlalchemy import select

from api.db.models import OAuthGrant
from api.modules.oauth.scopes import Scope
from api.modules.oauth.tokens import issue_tokens

CREDENCIAIS = Credentials(registration="251000000", password="senha123")


def _emitir(db, accepted):
    return asyncio.run(
        issue_tokens(
            db,
            client_id="agenda",
            credentials=CREDENCIAIS,
            accepted=accepted,
            authenticated_client=True,
        )
    )


def test_emissao_sem_o_perfil_e_recusada_e_nao_grava_autorizacao(db, database):
    for accepted in ([], [Scope.POSTS], [Scope.CLASSROOMS, Scope.GRADES]):
        with pytest.raises(ValueError):
            _emitir(db, accepted)
    with database.begin() as session:
        assert session.scalars(select(OAuthGrant)).all() == []


def test_toda_autorizacao_emitida_guarda_o_perfil(db, database):
    for extra in ([], [Scope.POSTS], [Scope.CLASSROOMS, Scope.GRADES]):
        pair = _emitir(db, [Scope.PROFILE, *extra])
        assert Scope.PROFILE in pair.scopes
        with database.begin() as session:
            assert Scope.PROFILE in session.get(OAuthGrant, pair.grant_id).scopes


def test_token_basico_le_o_perfil_sem_indices(client, emitir, stub_sigaa):
    response = client.get(
        "/me", headers={"Authorization": f"Bearer {emitir().access_token}"}
    )
    assert response.status_code == 200
    assert set(response.json()) == {"name", "registration", "photo", "course"}
