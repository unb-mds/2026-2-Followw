from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from sigaa_client import MaterialFile

from api.modules.classrooms.service import ClassroomService


@pytest.fixture
def material_api(api, stub_sigaa):
    service = SimpleNamespace(
        get_link=AsyncMock(return_value=SimpleNamespace(front_end_id="AAA"))
    )
    api.app.dependency_overrides[ClassroomService] = lambda: service
    stub_sigaa.classrooms.download_classroom_material = AsyncMock(
        return_value=MaterialFile(
            content=b"%PDF-1.7 conteudo",
            filename="Anotações.pdf",
            content_type="application/pdf",
        )
    )
    return api, service, stub_sigaa
