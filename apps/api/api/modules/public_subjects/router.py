from typing import Annotated

from fastapi import APIRouter, Query
from sigaa_client import SubjectLevel, SubjectSearchResult, SubjectType, TeachingLevel

from api.cache import NoStore
from api.modules.public_subjects.service import PublicSubjectServiceDep

router = APIRouter()


@router.get(
    "",
    response_model=SubjectSearchResult,
    summary="Buscar componentes curriculares públicos do SIGAA, sem login",
    description=(
        "Consulta o catálogo de componentes, independentemente de oferta de turmas ou semestre. "
        "Nível padrão: graduação (G). Os filtros nativos level, type, code, name e unit se combinam. "
        "contains filtra por nome ou código depois da consulta. O SIGAA limita buscas amplas a "
        "2000 componentes: a resposta preserva os itens e a mensagem original, com truncated=true. "
        "Não há paginação; refine os filtros nativos para obter resultados completos. "
        "returned_count conta os itens devolvidos após contains, não o total existente no SIGAA. "
        "Uma lista vazia com truncated=true não garante ausência de correspondências. "
        "Identifique o componente por sigaa_id: códigos podem se repetir entre níveis."
    ),
    responses={
        401: {
            "description": "Sessão pública do SIGAA expirada mesmo após uma tentativa de renovação. Não exige login do usuário."
        },
        422: {
            "description": "Filtro inválido, unidade inexistente ou nome de unidade ambíguo."
        },
        502: {"description": "SIGAA indisponível ou resposta ilegível."},
    },
    dependencies=[NoStore],
)
async def search_subjects(
    service: PublicSubjectServiceDep,
    level: Annotated[
        SubjectLevel,
        Query(
            description="F: formação complementar; G: graduação; L: especialização; R: residência; S: stricto sensu."
        ),
    ] = TeachingLevel.GRADUACAO,
    type: Annotated[
        SubjectType | None, Query(description="Tipo do componente curricular.")
    ] = None,
    code: Annotated[
        str | None,
        Query(
            min_length=1,
            pattern=r"\S",
            description="Trecho do código, como FGA00 ou 0003. Preserva zeros; o SIGAA ignora maiúsculas.",
        ),
    ] = None,
    name: Annotated[
        str | None,
        Query(
            min_length=1,
            pattern=r"\S",
            description="Trecho do nome enviado ao SIGAA; a busca ignora acentos e maiúsculas.",
        ),
    ] = None,
    unit: Annotated[
        str | None,
        Query(
            min_length=1,
            pattern=r"\S",
            description="ID da unidade responsável ou parte não ambígua do nome, como 'gama'.",
        ),
    ] = None,
    contains: Annotated[
        str | None,
        Query(
            description="Filtra os componentes retornados por trecho do nome ou código, ignorando acentos, maiúsculas e espaços extras. Vazio não filtra; não recupera itens cortados pelo limite do SIGAA."
        ),
    ] = None,
) -> SubjectSearchResult:
    return await service.search(
        unit, level=level, type=type, code=code, name=name, contains=contains
    )
