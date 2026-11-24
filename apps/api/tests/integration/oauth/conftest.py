import asyncio
from datetime import date
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

from api.db.main import Database
from api.modules.oauth.scopes import Scope
from api.modules.oauth.tokens import issue_tokens

from .helpers import APPLICATIONS, REDIRECT


@pytest.fixture
def db(async_database):
    return Database(async_database)


@pytest.fixture
def emitir(db):
    def issue(*scopes, client_id="agenda", proof=None, confidential=None):
        return asyncio.run(
            issue_tokens(
                db,
                client_id=client_id,
                accepted=(Scope.PROFILE, *scopes),
                credentials=Credentials(registration="251000000", password="senha123"),
                session_token="app14~SESSAO-EXPIRADA",
                proof=proof,
                authenticated_client=proof is None
                if confidential is None
                else confidential,
            )
        )

    return issue


@pytest.fixture
def sessao_web(cookies):
    def auth(registration="251000000"):
        credentials = Credentials(registration=registration, password="senha123")
        jar = cookies(refresh=credentials)
        return {"Cookie": f"refresh_token={jar['refresh_token']}"}

    return auth


@pytest.fixture
def criar_aplicacao(client, sessao_web):
    def create(name="Agenda", owner=None):
        response = client.post(
            APPLICATIONS,
            json={"name": name, "redirect_uris": [REDIRECT]},
            headers=owner or sessao_web(),
        )
        assert response.status_code == 201, response.json()
        return response.json()

    return create


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
