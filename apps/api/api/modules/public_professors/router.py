from typing import Annotated

from fastapi import APIRouter, Path, Query

from api.cache import NoStore
from api.modules.public_professors.service import (
    PROFESSORS_PAGE_SIZE,
    ProfessorDetails,
    ProfessorPage,
    ProfessorServiceDep,
)
from api.schemas import SearchText, UnitFilter

router = APIRouter()


@router.get(
    "",
    response_model=ProfessorPage,
    summary="Buscar docentes",
    responses={422: {"description": "Filtro inválido ou unidade inexistente."}},
    dependencies=[NoStore],
)
async def list_professors(
    service: ProfessorServiceDep,
    q: Annotated[
        SearchText | None,
        Query(
            description="Termos do nome do docente.",
        ),
    ] = None,
    unit: Annotated[
        UnitFilter | None,
        Query(description="ID ou sigla da unidade."),
    ] = None,
    semester: Annotated[
        str | None,
        Query(
            pattern=r"^[0-9]{4}(?:\.[0-9])?$",
            description="Período em que o docente ministrou aulas de graduação.",
        ),
    ] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = PROFESSORS_PAGE_SIZE,
) -> ProfessorPage:
    return await service.list(q, unit, semester, page, page_size)


@router.get(
    "/{siape}",
    response_model=ProfessorDetails,
    summary="Consultar perfil do docente",
    dependencies=[NoStore],
)
async def get_professor(
    service: ProfessorServiceDep,
    siape: Annotated[int, Path(gt=0, le=2**31 - 1, description="SIAPE do docente.")],
) -> ProfessorDetails:
    return await service.get(siape)
