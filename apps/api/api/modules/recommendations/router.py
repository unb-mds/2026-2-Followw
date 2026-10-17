from typing import Annotated

from fastapi import APIRouter, Query, Response
from pydantic import BaseModel, ConfigDict, Field

from api.modules.recommendations.ranking import Recommendations
from api.modules.recommendations.service import RecommendationServiceDep

router = APIRouter()


class RecommendationQuery(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    limit: int = Field(default=10, ge=1, le=100)


@router.get(
    "",
    response_model=Recommendations,
    summary="Recomenda matérias pela última oferta carregada",
    responses={
        401: {"description": "Sessão ausente ou inválida."},
        422: {
            "description": "Limite inválido, parâmetro desconhecido ou usuário fora da graduação."
        },
        502: {"description": "Falha na origem durante sincronização."},
        503: {"description": "Cache necessário ainda indisponível."},
        504: {"description": "only-if-cached sem fontes sincronizadas."},
    },
)
async def recommendations(
    service: RecommendationServiceDep,
    response: Response,
    query: Annotated[RecommendationQuery, Query()],
) -> Recommendations:
    """Ranking v2, com contexto estimado automaticamente e score explicado.

    Usa somente catálogo certificado e turmas marcadas no último snapshot carregado,
    sem prometer oferta vigente ou disponibilidade em tempo real. Turmas cheias permanecem.
    Pré/correquisitos exigem aprovação anterior. Módulo livre é excluído: fora da matriz,
    só entram equivalentes a obrigatórias pendentes. Sem matriz, a lista fica vazia.
    O próximo período é o inferido + 1 quando há obrigatórias em andamento.
    Pesos: obrigatória 50, próximo período 40, unidade 30, desbloqueios até 20,
    atrasada 15, equivalência 10 e optativa 5.
    O histórico pode omitir dispensas e aproveitamentos. Não constitui autorização de matrícula.
    Fontes seguem SWR; `Cache-Control: no-cache` revalida fontes não congeladas.
    A resposta personalizada sempre usa `no-store`; sem oferta, retorna lista vazia.
    """
    result = await service.recommend(query.limit)
    response.headers["Cache-Control"] = "no-store"
    return result
