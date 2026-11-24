from typing import Annotated

from fastapi import APIRouter, Query, Response

from api.cache import no_store
from api.modules.public_classrooms.code import ClassroomCode
from api.modules.public_subjects.filters import SubjectFilters
from api.modules.public_subjects.service import (
    CatalogSubject,
    PublicSubjectServiceDep,
    SubjectPage,
)
from api.modules.public_subjects.statistics import (
    SubjectStatistics,
    SubjectStatisticsServiceDep,
)
from api.sync import OptionalSyncDep, SyncDep

router = APIRouter()


@router.get(
    "/recommendations",
    summary="Recomendar matérias para o aluno autenticado",
    responses={
        401: {"description": "Sessão inválida ao buscar recomendações."},
        422: {"description": "Dados insuficientes para recomendar matérias."},
        502: {"description": "SIGAA indisponível ao consultar o histórico."},
        503: {"description": "Histórico em atualização."},
    },
)
async def subject_recommendations(
    service: PublicSubjectServiceDep, sync: SyncDep, response: Response
) -> list[CatalogSubject]:
    subjects = await service.recommendations(sync)
    no_store(response)
    return subjects


@router.get(
    "/{code}/statistics",
    response_model=SubjectStatistics,
    summary="Consultar estatísticas anteriores da matéria",
    description="Médias simples por turma de semestres anteriores com o mesmo conjunto de docentes. A cobertura depende dos dados coletados.",
)
async def subject_statistics(
    code: ClassroomCode,
    service: SubjectStatisticsServiceDep,
    response: Response,
    semester: Annotated[str, Query(pattern=r"^[0-9]{4}\.[0-9]$")],
    number: Annotated[str, Query(min_length=1, max_length=32)],
) -> SubjectStatistics:
    result = await service.get(code, semester, number)
    no_store(response)
    return result


@router.get(
    "",
    response_model=SubjectPage,
    summary="Buscar matérias com suas turmas",
    description="Página de matérias e ofertas do catálogo do Followw.",
    responses={
        404: {
            "description": "Matriz curricular não encontrada ao filtrar pelo tipo de matéria."
        },
        422: {"description": "Filtros inválidos."},
    },
)
async def search_subjects(
    service: PublicSubjectServiceDep,
    sync: OptionalSyncDep,
    response: Response,
    filters: Annotated[SubjectFilters, Query()],
) -> SubjectPage:
    subjects = await service.search(filters, sync)
    no_store(response)
    return subjects
