from typing import Annotated

from fastapi import APIRouter, Path, Query, Response
from sigaa_client import Classroom, ClassroomMember, News, StatisticsShare

from api.dependencies.refresh import RefreshQuery
from api.services.classroom import ClassroomServiceDep
from api.services.news import NewsServiceDep

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
    "/{classroom_id}/news",
    response_model=list[News],
    summary="Consultar notícias de uma turma do usuário",
    description="Consulta o SIGAA sem cache. Aceita classroom_sigaa_id retornado por /news (Classroom.sigaa_id) ou o antigo Classroom.id. Retorna o ID da notícia, o ID numérico da turma, título e dia. Para conteúdo e anexos, use /classrooms/{classroom_id}/news/{news_id}.",
    responses=CLASSROOM_ERRORS,
)
async def get_classroom_news(
    service: NewsServiceDep, classroom_id: str, response: Response
) -> list[News]:
    response.headers["Cache-Control"] = "no-store"
    return await service.list_classroom_news(classroom_id)


@router.get(
    "/{classroom_id}/news/{news_id}",
    response_model=News,
    summary="Consultar conteúdo e anexos de uma notícia da turma",
    description="Consulta o SIGAA sem cache. Aceita o ID numérico da turma (classroom_sigaa_id) ou o antigo Classroom.id. Retorna texto em Markdown, data e hora do SIGAA (sem fuso) e anexos com nome e URL. O news_id pode ser obtido em /news?resolve_ids=true ou na listagem da turma.",
    responses={
        **ERRORS,
        404: {
            "description": "Turma fora da lista do usuário ou notícia ausente na turma."
        },
    },
)
async def get_classroom_news_detail(
    service: NewsServiceDep,
    classroom_id: str,
    news_id: Annotated[
        int, Path(gt=0, description="ID da notícia na listagem da turma.")
    ],
    response: Response,
) -> News:
    response.headers["Cache-Control"] = "no-store"
    return await service.get_classroom_news(classroom_id, news_id)


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
