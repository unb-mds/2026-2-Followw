from typing import Annotated

from fastapi import APIRouter, Query
from sigaa_client import Classroom, ClassroomMember, StatisticsShare

from api.dependencies.refresh import RefreshQuery
from api.services.classroom import ClassroomServiceDep

router = APIRouter()

ERRORS = {
    401: {"description": "Credenciais ausentes ou inválidas."},
    502: {"description": "SIGAA indisponível."},
}
CLASSROOM_ERRORS = {
    **ERRORS,
    404: {"description": "Turma não encontrada entre as turmas do usuário."},
}


@router.get(
    "",
    response_model=list[Classroom],
    summary="Consultar as turmas do usuário autenticado",
    responses=ERRORS,
)
async def get_classrooms(
    service: ClassroomServiceDep,
    semester: Annotated[
        str | None,
        Query(
            pattern=r"^(all|[0-9]{4}\.[0-9])$",
            description="Sem filtro: turmas atuais. Use 'all' ou um semestre no formato AAAA.P, como 2026.2.",
        ),
    ] = None,
    refresh: RefreshQuery = False,
) -> list[Classroom]:
    return await service.list_classrooms(semester, refresh=refresh)


@router.get(
    "/{classroom_id}/members",
    response_model=list[ClassroomMember],
    summary="Consultar docentes e discentes de uma turma do usuário",
    responses=CLASSROOM_ERRORS,
)
async def get_classroom_members(
    service: ClassroomServiceDep, classroom_id: str, refresh: RefreshQuery = False
) -> list[ClassroomMember]:
    return await service.list_members(classroom_id, refresh=refresh)


@router.get(
    "/{classroom_id}/statistics",
    response_model=list[StatisticsShare],
    summary="Consultar a situação dos discentes de uma turma do usuário",
    responses=CLASSROOM_ERRORS,
)
async def get_classroom_statistics(
    service: ClassroomServiceDep, classroom_id: str, refresh: RefreshQuery = False
) -> list[StatisticsShare]:
    return await service.list_statistics(classroom_id, refresh=refresh)
