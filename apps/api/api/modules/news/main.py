from typing import Annotated

from fastapi import APIRouter, Query, Response
from sigaa_client import News

from api.services.news import NewsServiceDep

router = APIRouter()


@router.get(
    "",
    response_model=list[News],
    summary="Consultar notícias recentes das turmas na home do SIGAA",
    description="Consulta o SIGAA sem cache. Por padrão, lê apenas as notícias recentes da home, que não expõe o ID da notícia. Com resolve_ids=true, consulta a listagem de cada turma citada para preencher id quando título e dia identificam uma única notícia. Use classroom_sigaa_id e id em /classrooms/{classroom_id}/news/{news_id}. Associações ausentes ou ambíguas mantêm id=null.",
    responses={
        401: {"description": "Credenciais ausentes ou inválidas."},
        502: {"description": "SIGAA indisponível."},
    },
)
async def get_news(
    service: NewsServiceDep,
    response: Response,
    resolve_ids: Annotated[bool, Query(description="Resolve os IDs com uma consulta adicional à listagem de notícias por turma.")] = False,
) -> list[News]:
    response.headers["Cache-Control"] = "no-store"
    return await service.list_news(resolve_ids=resolve_ids)
