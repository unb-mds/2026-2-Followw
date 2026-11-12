from datetime import date, datetime
from unittest.mock import AsyncMock

import pytest
from sigaa_client import (
    Classroom,
    ClassroomPost,
    DashboardPost,
    News,
    NewsAttachment,
    PostType,
    Subject,
)

from .helpers import CREDENTIALS


@pytest.fixture
def reading_client(client, cookies, posts_sigaa):
    client.cookies.update(cookies(refresh=CREDENTIALS))
    return client


@pytest.fixture
def posts_sigaa(stub_sigaa):
    stub_sigaa.classrooms.list_dashboard_posts = AsyncMock(
        return_value=[
            DashboardPost(
                type=PostType.NEWS,
                classroom_sigaa_id=123,
                title="Aviso",
                published_on=date(2026, 9, 24),
            ),
            DashboardPost(
                type=PostType.ASSESSMENT,
                classroom_sigaa_id=123,
                title="Avaliação A2",
                starts_on=date(2026, 10, 29),
            ),
        ]
    )
    stub_sigaa.classrooms.list_classroom_news = AsyncMock(
        return_value=[News(id=1, title="Aviso", published_on=date(2026, 9, 24))]
    )
    stub_sigaa.classrooms.get_classroom_news = AsyncMock(
        return_value=News(
            id=1,
            title="Aviso",
            published_on=date(2026, 9, 24),
            published_at=datetime.fromisoformat("2026-09-24T10:30:00"),
            content="Leia o **material** antes da aula.",
            attachments=(
                NewsAttachment(
                    name="Material.pdf", url="https://sigaa.unb.br/material.pdf"
                ),
            ),
        )
    )
    stub_sigaa.classrooms.list_classrooms.return_value = [
        Classroom(
            id="AAA",
            sigaa_id=123,
            number="01",
            current=True,
            semester="2026.2",
            subject=Subject(code="FGA0146", name="ESTRUTURAS DE DADOS 1"),
        )
    ]
    stub_sigaa.classrooms.list_classroom_posts = AsyncMock(
        return_value=[
            ClassroomPost.from_news(n)
            for n in stub_sigaa.classrooms.list_classroom_news.return_value
        ]
    )
    return stub_sigaa
