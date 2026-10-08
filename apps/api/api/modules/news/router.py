from typing import Annotated

from fastapi import APIRouter, Query
from sigaa_client import News

from api.cache import NoStore
from api.errors import SIGAA_ERRORS
from api.modules.news.service import NewsServiceDep

router = APIRouter()


@router.get(
    "",
    response_model=list[News],
    summary="Consultar notícias recentes das turmas na home do SIGAA",
    description=("Notícias recentes da home, sem cache."),
    responses=SIGAA_ERRORS,
    dependencies=[NoStore],
)
async def get_news(
    service: NewsServiceDep,
    resolve_ids: Annotated[
        bool,
        Query(
            description="Resolve os IDs com uma consulta adicional à listagem de notícias por turma."
        ),
    ] = False,
) -> list[News]:
    return await service.list_news(resolve_ids=resolve_ids)
