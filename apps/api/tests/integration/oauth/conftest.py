import asyncio

import pytest
from sigaa_client import Credentials

from api.db.main import Database
from api.modules.oauth.scopes import Scope
from api.modules.oauth.tokens import issue_tokens


@pytest.fixture
def db(async_database):
    return Database(async_database)


@pytest.fixture
def emitir(db):
    def issue(*scopes, client_id="agenda", proof=None):
        return asyncio.run(
            issue_tokens(
                db,
                client_id=client_id,
                accepted=(Scope.PROFILE, *scopes),
                credentials=Credentials(registration="251000000", password="senha123"),
                session_token="app14~SESSAO-EXPIRADA",
                proof=proof,
                authenticated_client=proof is None,
            )
        )

    return issue
