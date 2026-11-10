from typing import Annotated

from fastapi import APIRouter, Query, Response

from api.cache import no_store
from api.modules.public_search.service import (
    SearchResult,
    SearchServiceDep,
    SearchType,
)
from api.schemas import SearchText, UnitFilter
from api.sync import OptionalSyncDep

router = APIRouter()


@router.get(
    "",
    response_model=SearchResult,
    summary="Buscar matérias, cursos e docentes",
    description="Reúne matérias e a primeira página de cursos e docentes. Com login, inclui os dados da matriz do aluno.",
    responses={422: {"description": "Texto ou tipo inválido, ou unidade inexistente."}},
)
async def search(
    service: SearchServiceDep,
    sync: OptionalSyncDep,
    response: Response,
    q: Annotated[
        SearchText,
        Query(
            description="Termos da busca.",
        ),
    ],
    type: Annotated[
        list[SearchType] | None,
        Query(description="Tipos buscados; repita o parâmetro para selecionar vários."),
    ] = None,
    unit: Annotated[
        UnitFilter | None,
        Query(description="ID ou sigla da unidade, para todos os tipos."),
    ] = None,
) -> SearchResult:
    result = await service.search(q, type, unit, sync)
    no_store(response)
    return result
