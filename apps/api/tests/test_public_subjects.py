from unittest.mock import AsyncMock

import pytest
from sigaa_client import (
    PublicSubject,
    SessionExpired,
    SigaaParseError,
    SigaaSearchError,
    SubjectSearchMessage,
    SubjectSearchResult,
    SubjectType,
    TeachingLevel,
)

from api.db.main import get_sessionmaker
from api.sigaa import get_sigaa_public_client
from api.sync.queue import get_job_queue


@pytest.fixture
def subjects(client):
    public = AsyncMock()
    public.subjects.search.return_value = SubjectSearchResult(
        items=(
            PublicSubject(
                sigaa_id=1,
                code="FGA0003",
                name="COMPILAÇÃO DE PROGRAMAS",
                level=TeachingLevel.GRADUACAO,
                type=SubjectType.DISCIPLINA,
                hours=60,
            ),
            PublicSubject(
                sigaa_id=2,
                code="MAT0001",
                name="CÁLCULO",
                level=TeachingLevel.GRADUACAO,
                type=SubjectType.DISCIPLINA,
                hours=90,
            ),
        )
    )
    client.app.dependency_overrides[get_sigaa_public_client] = lambda: public
    return public.subjects.search


def test_public_search_forwards_native_filters_without_database(client, subjects):
    def forbidden():
        pytest.fail("Busca de componentes não deve depender de banco ou fila")

    client.app.dependency_overrides[get_sessionmaker] = forbidden
    client.app.dependency_overrides[get_job_queue] = forbidden
    response = client.get(
        "/public/subjects",
        params={
            "level": "G",
            "type": "DISCIPLINA",
            "unit": "gama",
            "code": "0003",
            "name": "compilação",
        },
    )
    assert response.status_code == 200
    assert "no-store" in response.headers["cache-control"]
    assert "set-cookie" not in response.headers
    subjects.assert_awaited_once_with(
        "gama",
        level=TeachingLevel.GRADUACAO,
        type=SubjectType.DISCIPLINA,
        code="0003",
        name="compilação",
    )
    assert response.json()["returned_count"] == 2


@pytest.mark.parametrize(
    "contains,expected",
    [
        ("  compilacao   DE ", [1]),
        ("fga000", [1]),
        ("CALCULO", [2]),
        ("missing", []),
        ("   ", [1, 2]),
    ],
)
def test_contains_matches_name_or_code_locally(client, subjects, contains, expected):
    response = client.get("/public/subjects", params={"contains": contains})
    assert response.status_code == 200
    result = response.json()
    assert [item["sigaa_id"] for item in result["items"]] == expected
    assert result["returned_count"] == len(expected)
    assert "contains" not in subjects.call_args.kwargs


def test_limit_warning_survives_empty_local_filter(client, subjects):
    subjects.return_value = subjects.return_value.model_copy(
        update={
            "truncated": True,
            "messages": (
                SubjectSearchMessage(
                    code="result_limit_exceeded",
                    severity="warning",
                    text="A busca excedeu o número máximo de 2000 resultados. Favor refine a sua busca.",
                ),
            ),
        }
    )
    result = client.get("/public/subjects", params={"contains": "missing"}).json()
    assert result["truncated"] is True
    assert result["returned_count"] == 0
    assert result["messages"][0]["code"] == "result_limit_exceeded"


@pytest.mark.parametrize(
    "params",
    [
        {"level": "E"},
        {"level": "D"},
        {"type": "invalid"},
        {"code": ""},
        {"name": " "},
        {"unit": " "},
    ],
)
def test_validation_before_sigaa(client, subjects, params):
    assert client.get("/public/subjects", params=params).status_code == 422
    subjects.assert_not_awaited()


@pytest.mark.parametrize(
    "error,status",
    [
        (SessionExpired("Sessão pública expirada"), 401),
        (SigaaSearchError("Unidade inválida"), 422),
        (SigaaParseError("Tabela ausente"), 502),
    ],
)
def test_sigaa_errors_use_existing_handlers(client, subjects, error, status):
    subjects.side_effect = error
    assert client.get("/public/subjects").status_code == status


def test_openapi_filters_and_no_units_route(client):
    schema = client.get("/openapi.json").json()
    assert "401" in schema["paths"]["/public/subjects"]["get"]["responses"]
    params = schema["paths"]["/public/subjects"]["get"]["parameters"]
    assert {item["name"] for item in params} == {
        "level",
        "type",
        "code",
        "name",
        "unit",
        "contains",
    }
    assert next(item for item in params if item["name"] == "level")["schema"][
        "enum"
    ] == ["F", "G", "L", "R", "S"]
    assert "/public/subjects/units" not in schema["paths"]
