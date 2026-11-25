import asyncio
from datetime import date
from hashlib import sha256
from unittest.mock import AsyncMock

import pytest
from sigaa_client import (
    Classroom,
    ClassroomFrequency,
    ClassroomGrade,
    ClassroomPost,
    Credentials,
    Grade,
    News,
    Subject,
)
from sqlalchemy import select

from api.db.main import Database
from api.db.models import OAuthClient
from api.modules.oauth.clients import generate_client_secret
from api.modules.oauth.scopes import Scope
from api.modules.oauth.tokens import create_token_pair


@pytest.fixture
def db(async_database):
    return Database(async_database)


@pytest.fixture
def emitir(db):
    def issue(*scopes, client_id="agenda", proof=None, confidential=None):
        is_confidential = proof is None if confidential is None else confidential

        async def _ensure_client_and_issue():
            async def ensure(session):
                existente = await session.scalar(
                    select(OAuthClient).where(OAuthClient.client_id == client_id)
                )
                if existente is None:
                    salt = digest = None
                    if is_confidential:
                        _, salt, _ = generate_client_secret()
                        digest = sha256(salt + b"segredo-teste").digest()
                    session.add(
                        OAuthClient(
                            client_id=client_id,
                            owner_registration="251000000",
                            name=client_id,
                            description=None,
                            homepage_url=None,
                            confidential=is_confidential,
                            redirect_uris=["https://app.followw.test/callback"],
                            secret_salt=salt,
                            secret_hash=digest,
                        )
                    )

            await db.write(ensure)
            return await db.write(
                lambda session: create_token_pair(
                    session,
                    client_id=client_id,
                    accepted=(Scope.PROFILE, *scopes),
                    credentials=Credentials(
                        registration="251000000", password="senha123"
                    ),
                    session_token="app14~SESSAO-EXPIRADA",
                    proof=proof,
                    authenticated_client=is_confidential,
                )
            )

        return asyncio.run(_ensure_client_and_issue())

    return issue


@pytest.fixture
def turmas(stub_sigaa):
    subject = Subject(name="Compiladores", code="CIC0001", hours=60)
    atual = Classroom(
        id="AAA",
        number="01",
        semester="2026.2",
        current=True,
        schedule="3M12",
        subject=subject,
    )
    antiga = atual.model_copy(
        update={"id": "BBB", "semester": "2025.2", "current": False}
    )
    stub_sigaa.classrooms.list_classrooms.return_value = [atual, antiga]
    stub_sigaa.classrooms.list_grades.return_value = [
        ClassroomGrade(subject_code=subject.code, semester="2025.2", grade=Grade.MS)
    ]
    stub_sigaa.classrooms.get_classroom_frequency = AsyncMock(
        return_value=ClassroomFrequency(
            progress={"taught": 10, "total": 60, "percentage": 17}
        )
    )
    return stub_sigaa


@pytest.fixture
def noticias(turmas):
    post = ClassroomPost.from_news(
        News(id=1, title="Aviso", published_on=date(2026, 9, 17))
    )
    turmas.classrooms.list_classroom_posts = AsyncMock(return_value=[post])
    turmas.classrooms.list_dashboard_posts = AsyncMock(return_value=[])


@pytest.fixture
def autorizacao(client, cookies, stub_sigaa):
    from base64 import urlsafe_b64encode
    from hashlib import sha256

    client.cookies.update(
        cookies(refresh=Credentials(registration="251000000", password="senha123"))
    )
    app = client.post(
        "/oauth/clients",
        json={
            "name": "Agenda",
            "confidential": True,
            "redirect_uris": ["https://agenda.test/callback?view=calendar"],
        },
    ).json()
    verifier = "v" * 43
    params = {
        "response_type": "code",
        "client_id": app["client_id"],
        "redirect_uri": app["redirect_uris"][0],
        "scope": "profile:read",
        "state": "estado com & e +",
        "code_challenge_method": "S256",
        "code_challenge": urlsafe_b64encode(sha256(verifier.encode()).digest())
        .decode()
        .rstrip("="),
    }
    return app, params, verifier
