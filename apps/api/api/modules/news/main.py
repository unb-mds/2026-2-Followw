from typing import Annotated

from fastapi import APIRouter, Query, Response
from sigaa_client import News

from api.services.news import NewsServiceDep

router = APIRouter()


@router.get(
    "",
    response_model=list[News],
    summary="Consultar notícias recentes das turmas na home do SIGAA",
    description=("Notícias recentes da home, sem cache."),
    responses={
        401: {"description": "Credenciais ausentes ou inválidas."},
        502: {"description": "SIGAA indisponível."},
    },
)
async def get_news(
    service: NewsServiceDep,
    response: Response,
    resolve_ids: Annotated[
        bool,
        Query(
            description="Resolve os IDs com uma consulta adicional à listagem de notícias por turma."
        ),
    ] = False,
) -> list[News]:
    response.headers["Cache-Control"] = "no-store"
    return await service.list_news(resolve_ids=resolve_ids)
