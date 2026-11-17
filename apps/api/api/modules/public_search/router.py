from typing import Annotated

from fastapi import APIRouter, Query, Response
from pydantic import AfterValidator, StringConstraints

from api.cache import no_store
from api.modules.public_search.service import (
    SearchResult,
    SearchServiceDep,
    SearchType,
)
from api.modules.public_subjects.schedule_search import parse_schedule_search
from api.schemas import UnitFilter
from api.sync import OptionalSyncDep

router = APIRouter()


def _validate_text(text: str) -> str:
    if len(text) < 3 and parse_schedule_search(text) is None:
        raise ValueError("Informe pelo menos 3 caracteres ou um horário válido.")
    return text


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
        str,
        StringConstraints(
            strip_whitespace=True,
            min_length=1,
            max_length=32,
            pattern=r"^[^\x00-\x1f\x7f]+$",
        ),
        AfterValidator(_validate_text),
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
    result = await service.search(
        q, type, unit, sync, schedule=parse_schedule_search(q)
    )
    no_store(response)
    return result
