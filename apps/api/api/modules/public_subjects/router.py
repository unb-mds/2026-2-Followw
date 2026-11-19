from datetime import time
from typing import Annotated

from fastapi import APIRouter, Query, Response
from pydantic import AfterValidator

from api.cache import no_store
from api.modules.public_classrooms.code import ClassroomCode
from api.modules.public_subjects.repository import WorkloadFilter
from api.modules.public_subjects.schedule_search import (
    ScheduleSearch,
    StartTimeSearch,
    parse_schedule_search,
)
from api.modules.public_subjects.service import CatalogSubject, PublicSubjectServiceDep
from api.modules.public_subjects.statistics import (
    SubjectStatistics,
    SubjectStatisticsServiceDep,
)
from api.schemas import SearchText, UnitFilter
from api.sync import OptionalSyncDep

router = APIRouter()


@router.get("/workloads", summary="Listar cargas horárias das matérias do catálogo")
async def subject_workloads(service: PublicSubjectServiceDep) -> list[int]:
    return await service.workloads()


def _valid_schedule(value: str | None) -> str | None:
    if value is not None and parse_schedule_search(value) is None:
        raise ValueError("Horário inválido.")
    return value


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
        404: {
            "description": "Matriz curricular não encontrada ao filtrar pelo tipo de matéria."
        },
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
    days: Annotated[
        str | None,
        Query(
            pattern=r"^[0-6]{1,7}$",
            description="Dias exatos, de segunda (0) a domingo (6).",
        ),
    ] = None,
    start: Annotated[
        str | None, Query(pattern=r"^(?:[01][0-9]|2[0-3]):[0-5][0-9]$")
    ] = None,
    hours: Annotated[
        WorkloadFilter | None,
        Query(
            description="Carga horária exata ou 180+ para a faixa inclusiva de 180 a 960 horas."
        ),
    ] = None,
    electives: Annotated[
        bool,
        Query(description="Optativas com oferta disponível na matriz do aluno."),
    ] = False,
    free_modules: Annotated[
        bool, Query(description="Módulos livres com oferta disponível para o aluno.")
    ] = False,
    timetable: Annotated[
        str | None, Query(min_length=1, max_length=32), AfterValidator(_valid_schedule)
    ] = None,
    semester: Annotated[
        str | None,
        Query(
            pattern=r"^[0-9]{4}\.[0-9]$",
            description="Semestre das turmas.",
        ),
    ] = None,
) -> list[CatalogSubject]:
    schedules: list[ScheduleSearch] = []
    if timetable and (parsed := parse_schedule_search(timetable)):
        schedules.append(parsed)
    if start or days:
        schedules.append(
            StartTimeSearch(
                time.fromisoformat(start) if start else None,
                frozenset(map(int, days or "")),
            )
        )
    subjects = await service.search(
        q,
        code=code,
        unit=unit,
        semester=semester,
        sync=sync,
        hours=hours,
        electives=electives,
        free_modules=free_modules,
        schedules=schedules,
    )
    no_store(response)
    return subjects
