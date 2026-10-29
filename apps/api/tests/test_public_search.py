from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from api.main import app
from api.modules.public_professors.service import ProfessorItem, ProfessorPage
from api.modules.public_search.schemas import SearchResult
from api.modules.public_search.service import SearchService
from api.schemas import UnitRef


@pytest.fixture
def mock_search_service():
    service = AsyncMock(spec=SearchService)
    app.dependency_overrides[SearchService] = lambda: service
    yield service
    app.dependency_overrides.pop(SearchService, None)


def test_busca_unificada_valida_minimo_tres_caracteres():
    with TestClient(app) as client:
        response = client.get("/public/search", params={"q": "ab"})
        assert response.status_code == 422


def test_busca_unificada_retorna_professores_e_materias_com_no_store(
    mock_search_service,
):
    mock_search_service.search.return_value = SearchResult(
        professors=[
            ProfessorItem(
                siape=12345,
                name="EDSON ALVES",
                unit=UnitRef(id=673, code="FCTE", name="CAMPUS UNB GAMA"),
                photo="https://sigaa.unb.br/foto.jpg",
                url="https://sigaa.unb.br/perfil?siape=12345",
            )
        ],
        subjects=[],
    )

    with TestClient(app) as client:
        response = client.get("/public/search", params={"q": "edson"})
        assert response.status_code == 200
        assert response.headers["cache-control"] == "no-store"
        data = response.json()
        assert len(data["professors"]) == 1
        assert data["professors"][0]["name"] == "EDSON ALVES"
        assert data["professors"][0]["unit"]["code"] == "FCTE"
        assert data["subjects"] == []


def test_busca_unificada_passa_parametros_para_o_servico(mock_search_service):
    mock_search_service.search.return_value = SearchResult(
        professors=[],
        subjects=[],
    )

    with TestClient(app) as client:
        response = client.get(
            "/public/search", params={"q": "computacao", "unit": "673"}
        )
        assert response.status_code == 200
        mock_search_service.search.assert_awaited_once_with("computacao", 673)


@pytest.mark.asyncio
async def test_servico_de_busca_combina_resultados_de_docentes_e_disciplinas():
    mock_professors = AsyncMock()
    mock_subjects = AsyncMock()

    mock_professors.list.return_value = ProfessorPage(
        items=[
            ProfessorItem(
                siape=999,
                name="PROFESSOR TESTE",
                unit=UnitRef(id=508, code="CIC", name="DEPTO CIENCIA DA COMPUTACAO"),
                photo=None,
                url="https://sigaa.unb.br/perfil?siape=999",
            )
        ],
        total=1,
        page=1,
        page_size=20,
    )
    mock_subjects.search.return_value = []

    service = SearchService(professors=mock_professors, subjects=mock_subjects)
    result = await service.search(q="teste", unit=508)

    mock_professors.list.assert_awaited_once_with(
        q="teste",
        unit=508,
        semester=None,
        page=1,
        page_size=20,
    )
    mock_subjects.search.assert_awaited_once_with(q="teste", unit=508)
    assert len(result.professors) == 1
    assert result.professors[0].siape == 999
    assert result.subjects == []


def test_openapi_inclui_public_search_na_documentacao():
    schema = app.openapi()
    tags = [t["name"] for t in schema.get("tags", [])]
    assert "Public Search" in tags

    # Verifica se a rota /public/search está presente no schema
    paths = schema.get("paths", {})
    assert "/public/search" in paths
    assert "get" in paths["/public/search"]

    # Verifica se está no grupo 'Public' do x-tagGroups
    public_group = next(
        (g for g in schema.get("x-tagGroups", []) if g["name"] == "Public"), None
    )
    assert public_group is not None
    assert "Public Search" in public_group["tags"]
