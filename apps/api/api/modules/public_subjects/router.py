from typing import Annotated

from fastapi import APIRouter, Query, Response

from api.cache import no_store
from api.modules.public_classrooms.code import ClassroomCode
from api.modules.public_subjects.service import CatalogSubject, PublicSubjectServiceDep
from api.modules.public_subjects.statistics import (
    SubjectStatistics,
    SubjectStatisticsServiceDep,
)
from api.schemas import SearchText, UnitFilter
from api.sync import OptionalSyncDep

router = APIRouter()


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
    response_model=list[CatalogSubject],
    summary="Buscar matérias com suas turmas",
    description="Matérias e ofertas do catálogo do Followw. Sem filtros de busca, retorna recomendações para o aluno autenticado.",
    responses={
        401: {"description": "Sessão inválida ao buscar recomendações."},
        422: {
            "description": "Filtros inválidos ou dados insuficientes para recomendar matérias."
        },
        502: {"description": "SIGAA indisponível ao consultar o histórico."},
        503: {"description": "Histórico em atualização."},
    },
)
async def search_subjects(
    service: PublicSubjectServiceDep,
    sync: OptionalSyncDep,
    response: Response,
    q: Annotated[
        SearchText | None,
        Query(
            description="Termos do código, nome da matéria ou docente. Códigos completos também buscam equivalências.",
        ),
    ] = None,
    code: Annotated[
        ClassroomCode | None,
        Query(description="Código completo da matéria."),
    ] = None,
    unit: Annotated[
        UnitFilter | None,
        Query(description="ID ou sigla da unidade responsável."),
    ] = None,
    semester: Annotated[
        str | None,
        Query(
            pattern=r"^[0-9]{4}\.[0-9]$",
            description="Semestre das turmas.",
        ),
    ] = None,
) -> list[CatalogSubject]:
    subjects = await service.search(
        q, code=code, unit=unit, semester=semester, sync=sync
    )
    no_store(response)
    return subjects
