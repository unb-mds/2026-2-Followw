from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Path, Query, Response
from pydantic import AfterValidator, BaseModel, Field
from sigaa_client import PostType, StatisticsShare

from api.cache import NoStore, no_store
from api.db.enums import LessonStatus
from api.errors import SIGAA_ERRORS
from api.modules.classrooms.frequency import (
    ClassroomFrequencyResult,
    FrequencyServiceDep,
)
from api.modules.classrooms.lessons import ClassroomFrequencyView
from api.modules.classrooms.post_reading import ClassroomPostView
from api.modules.classrooms.posts import ClassroomPostsServiceDep
from api.modules.classrooms.service import (
    ClassroomMembers,
    ClassroomServiceDep,
    ParticipantClassroom,
)

router = APIRouter()

CLASSROOM_ERRORS = {
    **SIGAA_ERRORS,
    404: {"description": "Turma não encontrada entre as turmas do usuário."},
}
ClassroomId = Annotated[str, Path(description="Classroom.id ou Classroom.sigaa_id.")]
PostId = Annotated[
    str,
    Path(
        pattern=r"^(news:[1-9][0-9]*|assessment:[1-9][0-9]*|topic:[a-f0-9]{64}|material:[a-f0-9]{64})$",
        description="ID do post na listagem da turma.",
    ),
]


class LessonMark(BaseModel):
    lesson_id: UUID = Field(description="ID da aula.")
    # `None` remove a marcação: a aula sem chamada não é uma marcação.
    status: (
        Literal[LessonStatus.PRESENTE, LessonStatus.FALTA, LessonStatus.CANCELADA]
        | None
    )


def _unique_lessons(marks: list[LessonMark]) -> list[LessonMark]:
    if len({mark.lesson_id for mark in marks}) < len(marks):
        raise ValueError("Aula repetida.")
    return marks


@router.get(
    "/{classroom_id}/posts",
    response_model=list[ClassroomPostView],
    summary="Consultar posts de uma turma",
    description="Notícias, tópicos, materiais e avaliações. Materiais se vinculam ao tópico por topic_id; texto e anexos das notícias ficam no detalhe.",
    responses={
        **CLASSROOM_ERRORS,
        503: {"description": "Cache em atualização."},
        504: {"description": "Posts ainda não disponíveis no cache."},
    },
)
async def get_classroom_posts(
    service: ClassroomPostsServiceDep,
    classroom_id: ClassroomId,
    post_type: Annotated[
        PostType | None,
        Query(alias="type", description="Categoria do post."),
    ] = None,
) -> list[ClassroomPostView]:
    posts = await service.list_posts(classroom_id)
    return [post for post in posts if post_type is None or post.type == post_type]


@router.get(
    "/{classroom_id}/posts/{post_id}",
    response_model=ClassroomPostView,
    summary="Consultar um post da turma",
    description="Notícias incluem texto em Markdown e anexos; avaliações não incluem notas individuais.",
    responses={
        **CLASSROOM_ERRORS,
        404: {"description": "Turma ou post não encontrado."},
        503: {"description": "Cache em atualização."},
        504: {"description": "Post ainda não disponível no cache."},
    },
)
async def get_classroom_post(
    service: ClassroomPostsServiceDep,
    classroom_id: ClassroomId,
    post_id: PostId,
) -> ClassroomPostView:
    return await service.get_post(classroom_id, post_id)


@router.put(
    "/{classroom_id}/posts/{post_id}/read",
    status_code=204,
    summary="Confirmar a leitura de uma postagem",
    description="Operação individual, idempotente e sem corpo. Consultar ou atualizar uma postagem não altera sua leitura.",
    responses={
        **CLASSROOM_ERRORS,
        404: {"description": "Turma ou post não encontrado."},
    },
)
async def mark_post_read(
    service: ClassroomPostsServiceDep,
    response: Response,
    classroom_id: ClassroomId,
    post_id: PostId,
) -> None:
    await service.mark_read(classroom_id, post_id, True)
    no_store(response)


@router.delete(
    "/{classroom_id}/posts/{post_id}/read",
    status_code=204,
    summary="Marcar uma postagem como não lida",
    description="Remove somente a leitura do usuário autenticado; repetir a operação não altera o resultado.",
    responses={
        **CLASSROOM_ERRORS,
        404: {"description": "Turma ou post não encontrado."},
    },
)
async def mark_post_unread(
    service: ClassroomPostsServiceDep,
    response: Response,
    classroom_id: ClassroomId,
    post_id: PostId,
) -> None:
    await service.mark_read(classroom_id, post_id, False)
    no_store(response)


@router.get(
    "",
    response_model=list[ParticipantClassroom],
    summary="Listar turmas do usuário",
    responses=SIGAA_ERRORS,
)
async def get_classrooms(
    service: ClassroomServiceDep,
    semester: Annotated[
        str | None,
        Query(
            pattern=r"^(all|[0-9]{4}\.[0-9])$",
            description="Semestre das turmas; 'all' inclui todo o histórico.",
        ),
    ] = None,
) -> list[ParticipantClassroom]:
    return await service.list_classrooms(semester)


@router.get(
    "/frequency",
    response_model=list[ClassroomFrequencyResult],
    summary="Consultar frequência das turmas atuais",
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
    description="Aulas em ordem da mais recente para a mais antiga. Os totais incluem as marcações do aluno.",
    responses={**CLASSROOM_ERRORS, 503: {"description": "Cache em atualização."}},
)
async def get_classroom_frequency(
    service: FrequencyServiceDep,
    classroom_id: ClassroomId,
) -> ClassroomFrequencyView:
    return await service.get_frequency(classroom_id)


@router.patch(
    "/{classroom_id}/frequency/lessons",
    status_code=204,
    summary="Marcar presença, falta ou aula cancelada",
    description="Aplica todas as marcações ou nenhuma. A chamada do SIGAA substitui as marcações pessoais; status null remove uma marcação pessoal.",
    responses={
        **CLASSROOM_ERRORS,
        404: {"description": "Turma ou aula não encontrada."},
        409: {"description": "O SIGAA já registrou a chamada de uma das aulas."},
    },
    dependencies=[NoStore],
)
async def mark_lessons(
    service: FrequencyServiceDep,
    classroom_id: ClassroomId,
    body: Annotated[list[LessonMark], AfterValidator(_unique_lessons)],
) -> None:
    await service.mark_lessons(
        classroom_id, {mark.lesson_id: mark.status for mark in body}
    )


@router.get(
    "/{classroom_id}/members",
    response_model=ClassroomMembers,
    summary="Listar participantes da turma",
    responses=CLASSROOM_ERRORS,
)
async def get_classroom_members(
    service: ClassroomServiceDep,
    classroom_id: ClassroomId,
) -> ClassroomMembers:
    return await service.list_members(classroom_id)


@router.get(
    "/{classroom_id}/statistics",
    response_model=list[StatisticsShare],
    summary="Consultar resultados da turma",
    description="Percentuais por situação dos alunos da turma encerrada.",
    responses={**CLASSROOM_ERRORS, 503: {"description": "Cache em atualização."}},
)
async def get_classroom_statistics(
    service: ClassroomServiceDep,
    classroom_id: ClassroomId,
) -> list[StatisticsShare]:
    return await service.get_statistics(classroom_id)
