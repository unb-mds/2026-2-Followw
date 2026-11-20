from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from sigaa_client import MaterialFile

from api.modules.classrooms.service import ClassroomService


@pytest.fixture
def material_payload():
    return SimpleNamespace(
        content=b"%PDF-1.7 conteudo",
        filename="Anotações.pdf",
        content_type="application/pdf",
    )


@pytest.fixture
def material_api(api, stub_sigaa, material_payload, monkeypatch):
    service = SimpleNamespace(
        get_link=AsyncMock(return_value=SimpleNamespace(front_end_id="AAA"))
    )
    monkeypatch.setattr(ClassroomService, "get_link", service.get_link)

    @asynccontextmanager
    async def open_material(*_):
        async def chunks():
            yield material_payload.content

        yield MaterialFile(
            content=chunks(),
            filename=material_payload.filename,
            content_type=material_payload.content_type,
        )

    stub_sigaa.classrooms.download_classroom_material = Mock(side_effect=open_material)
    return api, service, stub_sigaa
