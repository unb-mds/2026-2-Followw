from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Path, Query
from pydantic import BaseModel
from sigaa_client import (
    ClassroomMember,
    News,
    StatisticsShare,
)

from api.cache import NoStore
from api.db.enums import LessonStatus
from api.errors import SIGAA_ERRORS
from api.modules.classrooms.frequency import (
    ClassroomFrequencyResult,
    FrequencyServiceDep,
)
from api.modules.classrooms.lessons import ClassroomFrequencyView
from api.modules.classrooms.news import ClassroomNewsServiceDep
from api.modules.classrooms.service import ClassroomServiceDep, ParticipantClassroom

router = APIRouter()

CLASSROOM_ERRORS = {
    **SIGAA_ERRORS,
    404: {"description": "Turma não encontrada entre as turmas do usuário."},
}
NewsClassroomId = Annotated[
    str, Path(description="Classroom.id ou o classroom_sigaa_id de /news.")
]
ClassroomId = Annotated[str, Path(description="Classroom.id ou Classroom.sigaa_id.")]
LessonId = Annotated[UUID, Path(description="Lesson.id de uma aula da turma.")]


class LessonMarkBody(BaseModel):
    # `None` remove a marcação: a aula sem chamada não é uma marcação.
    status: (
        Literal[LessonStatus.PRESENTE, LessonStatus.FALTA, LessonStatus.CANCELADA]
        | None
    )


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
    response_model=list[ParticipantClassroom],
    summary="Consultar as turmas do usuário autenticado",
    description="Cada turma traz a menção do usuário em grade (null até ser lançada ou sincronizada). A menção é atualizada pelo sync do login e de /auth/sigaa/refresh, e congela depois da consolidação das turmas.",
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
) -> list[ParticipantClassroom]:
    return await service.list_classrooms(semester)


@router.get(
    "/frequency",
    response_model=list[ClassroomFrequencyResult],
    summary="Consultar frequência de todas as turmas atuais",
    description="Turmas atuais com identificação e a mesma frequência da rota individual. Falha em uma turma retorna erro, sem omiti-la da lista.",
    responses={**CLASSROOM_ERRORS, 503: {"description": "Cache em atualização."}},
)
async def get_current_frequencies(
    service: FrequencyServiceDep,
) -> list[ClassroomFrequencyResult]:
    return await service.list_frequencies()


@router.get(
    "/{classroom_id}/frequency",
    response_model=ClassroomFrequencyView,
    summary="Consultar frequência e andamento de uma turma",
    description="Aceita Classroom.id (hash) ou sigaa_id numérico. frequency_status indica nao_registrada, parcialmente_registrada ou registrada nas entradas publicadas. lessons traz as aulas da turma (criadas pelo calendário e horário no sync das turmas, com start_time e end_time) até ontem, as publicadas pelo SIGAA fora delas e as com situação do aluno, mais recentes primeiro; totals soma as marcações aos totais do SIGAA.",
    responses={**CLASSROOM_ERRORS, 503: {"description": "Cache em atualização."}},
)
async def get_classroom_frequency(
    service: FrequencyServiceDep,
    classroom_id: ClassroomId,
) -> ClassroomFrequencyView:
    return await service.get_frequency(classroom_id)


@router.patch(
    "/{classroom_id}/frequency/lessons/{lesson_id}",
    status_code=204,
    summary="Marcar presença, falta ou aula cancelada",
    description="Vale enquanto o SIGAA não registra a aula: a chamada publicada substitui a marcação. status null remove a marcação, sem apagar a chamada do SIGAA. Marcar aula que ainda não aconteceu retorna 422.",
    responses={
        **CLASSROOM_ERRORS,
        404: {"description": "Turma ou aula não encontrada."},
        409: {"description": "O SIGAA já registrou a chamada da aula."},
    },
    dependencies=[NoStore],
)
async def mark_lesson(
    service: FrequencyServiceDep,
    classroom_id: ClassroomId,
    lesson_id: LessonId,
    body: LessonMarkBody,
) -> None:
    if body.status is None:
        await service.unmark_lesson(classroom_id, lesson_id)
    else:
        await service.mark_lesson(classroom_id, lesson_id, body.status)


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
