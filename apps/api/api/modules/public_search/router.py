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
    description="Combina, numa só resposta, as buscas de `/public/subjects`, `/public/courses` e `/public/professors` (primeira página), sem ir ao SIGAA. Cada chave vem no formato do seu endpoint e é nula quando o tipo não foi pedido. Com login, as matérias trazem os dados da matriz do aluno.",
    responses={422: {"description": "Texto ou tipo inválido, ou unidade inexistente."}},
)
async def search(
    service: SearchServiceDep,
    sync: OptionalSyncDep,
    response: Response,
    q: Annotated[
        SearchText,
        Query(
            description="Termos de 3 a 32 caracteres; cada um precisa aparecer, ignorando acentos e maiúsculas.",
        ),
    ],
    type: Annotated[
        list[SearchType] | None,
        Query(description="Tipos buscados, repetindo o parâmetro. Sem ele, todos."),
    ] = None,
    unit: Annotated[
        UnitFilter | None,
        Query(description="ID ou código exato da unidade, aplicado a todos os tipos."),
    ] = None,
) -> SearchResult:
    result = await service.search(
        q, type or ("subjects", "courses", "professors"), unit, sync
    )
    no_store(response)
    return result
