from typing import Annotated

from fastapi import APIRouter, Path, Query
from sigaa_client import (
    Classroom,
    ClassroomFrequency,
    ClassroomMember,
    News,
    StatisticsShare,
)

from api.errors import SIGAA_ERRORS
from api.modules.classrooms.news import ClassroomNewsServiceDep
from api.modules.classrooms.service import ClassroomFrequencyResult, ClassroomServiceDep

router = APIRouter()

CLASSROOM_ERRORS = {
    **SIGAA_ERRORS,
    404: {"description": "Turma não encontrada entre as turmas do usuário."},
}
NewsClassroomId = Annotated[
    str, Path(description="Classroom.id ou o classroom_sigaa_id de /news.")
]
ClassroomId = Annotated[str, Path(description="Classroom.id ou Classroom.sigaa_id.")]


@router.get(
    "/{classroom_id}/news",
    response_model=list[News],
    summary="Consultar notícias de uma turma do usuário",
    description="ID, título e dia das notícias da turma. Cache de 60 minutos, atualizado em segundo plano após vencer; notícias removidas no SIGAA são preservadas.",
    responses={
        **CLASSROOM_ERRORS,
        503: {"description": "Cache em atualização."},
        504: {"description": "Notícias ainda não disponíveis no cache."},
    },
)
async def get_classroom_news(
    service: ClassroomNewsServiceDep,
    classroom_id: NewsClassroomId,
) -> list[News]:
    return await service.list_classroom_news(classroom_id)


@router.get(
    "/{classroom_id}/news/{news_id}",
    response_model=News,
    summary="Consultar conteúdo e anexos de uma notícia da turma",
    description="Texto em Markdown, data e hora e anexos. Conteúdo salvo no primeiro acesso, sem revalidação automática. Cache-Control: no-cache força uma nova consulta.",
    responses={
        **SIGAA_ERRORS,
        404: {
            "description": "Turma fora da lista do usuário ou notícia ausente na turma."
        },
        503: {"description": "Cache em atualização."},
        504: {"description": "Conteúdo ainda não disponível no cache."},
    },
)
async def get_classroom_news_detail(
    service: ClassroomNewsServiceDep,
    classroom_id: NewsClassroomId,
    news_id: Annotated[
        int, Path(gt=0, description="ID da notícia na listagem da turma.")
    ],
) -> News:
    return await service.get_classroom_news(classroom_id, news_id)


@router.get(
    "",
    response_model=list[Classroom],
    summary="Consultar as turmas do usuário autenticado",
    responses=SIGAA_ERRORS,
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
) -> list[Classroom]:
    return await service.list_classrooms(semester)


@router.get(
    "/frequency",
    response_model=list[ClassroomFrequencyResult],
    summary="Consultar frequência de todas as turmas atuais",
    description="Turmas atuais com identificação, andamento, frequência, frequency_status e resumo das entradas. Falha em uma turma retorna erro, sem omiti-la da lista.",
    responses={**CLASSROOM_ERRORS, 503: {"description": "Cache em atualização."}},
)
async def get_current_frequencies(
    service: ClassroomServiceDep,
) -> list[ClassroomFrequencyResult]:
    return await service.list_frequencies()


@router.get(
    "/{classroom_id}/frequency",
    response_model=ClassroomFrequency,
    summary="Consultar frequência e andamento de uma turma",
    description="Aceita Classroom.id (hash) ou sigaa_id numérico. frequency_status indica not_registered, partially_registered ou registered nas entradas publicadas.",
    responses={**CLASSROOM_ERRORS, 503: {"description": "Cache em atualização."}},
)
async def get_classroom_frequency(
    service: ClassroomServiceDep,
    classroom_id: ClassroomId,
) -> ClassroomFrequency:
    return await service.get_frequency(classroom_id)


@router.get(
    "/{classroom_id}/members",
    response_model=list[ClassroomMember],
    summary="Consultar docentes e discentes de uma turma do usuário",
    responses=CLASSROOM_ERRORS,
)
async def get_classroom_members(
    service: ClassroomServiceDep,
    classroom_id: ClassroomId,
) -> list[ClassroomMember]:
    return await service.list_members(classroom_id)


@router.get(
    "/{classroom_id}/statistics",
    response_model=list[StatisticsShare],
    summary="Consultar a situação dos discentes de uma turma do usuário",
    responses=CLASSROOM_ERRORS,
)
async def get_classroom_statistics(
    service: ClassroomServiceDep,
    classroom_id: ClassroomId,
) -> list[StatisticsShare]:
    return await service.list_statistics(classroom_id)
