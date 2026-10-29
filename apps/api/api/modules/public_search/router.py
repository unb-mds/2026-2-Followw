from typing import Annotated

from fastapi import APIRouter, Query
from pydantic import StringConstraints

from api.cache import NoStore
from api.modules.public_search.schemas import SearchResult
from api.modules.public_search.service import SearchServiceDep
from api.schemas import UnitFilter

router = APIRouter()


@router.get(
    "",
    response_model=SearchResult,
    summary="Busca unificada do catálogo público",
    description="Pesquisa simultaneamente professores e componentes curriculares por termo e unidade.",
    responses={422: {"description": "Filtro inválido ou unidade inexistente."}},
    dependencies=[NoStore],
)
async def search_catalog(
    service: SearchServiceDep,
    q: Annotated[
        str,
        Query(
            min_length=3,
            max_length=100,
            pattern=r"\S",
            description="Termo da pesquisa (docente, componente ou código).",
        ),
        StringConstraints(strip_whitespace=True),
    ],
    unit: Annotated[
        UnitFilter | None,
        Query(
            description="ID ou código exato da unidade responsável, como 673 ou FCTE."
        ),
    ] = None,
) -> SearchResult:
    return await service.search(q, unit)
