from typing import Annotated

from fastapi import APIRouter, Query, Response
from pydantic import StringConstraints

from api.cache import no_store
from api.modules.public_classrooms.code import ClassroomCode
from api.modules.public_subjects.service import CatalogSubject, PublicSubjectServiceDep
from api.schemas import UnitFilter
from api.sync import OptionalSyncDep

router = APIRouter()


@router.get(
    "",
    response_model=list[CatalogSubject],
    summary="Buscar matérias com suas turmas",
    description="Consulta os componentes e turmas gravados no Followw, sem ir ao SIGAA; os filtros se combinam. Cada componente traz as turmas do semestre consultado, vazias se não houver oferta. Sem q, code e unit, um aluno de graduação logado recebe as recomendações para o próximo semestre, ordenadas e com `recommendation`; visitantes precisam informar um filtro.",
    responses={
        401: {"description": "Sessão inválida ao buscar recomendações."},
        422: {
            "description": "Visitante sem filtro, usuário fora da graduação ou sem matriz identificada sem filtro, filtro inválido, unidade inexistente ou nome de unidade ambíguo."
        },
        502: {
            "description": "Falha no SIGAA ao sincronizar o histórico das recomendações."
        },
        503: {
            "description": "Histórico alterado durante a consulta das recomendações."
        },
    },
)
async def search_subjects(
    service: PublicSubjectServiceDep,
    sync: OptionalSyncDep,
    response: Response,
    q: Annotated[
        str | None,
        Query(
            min_length=3,
            max_length=32,
            pattern=r"\S",
            description="Trecho do código, nome do componente ou docente, de 3 a 32 caracteres, ignorando acentos, maiúsculas e espaços extras.",
        ),
        StringConstraints(strip_whitespace=True),
    ] = None,
    code: Annotated[
        ClassroomCode | None,
        Query(description="Código completo do componente, como FGA0003."),
    ] = None,
    unit: Annotated[
        UnitFilter | None,
        Query(
            description="ID ou código exato da unidade responsável, como 673 ou FCTE."
        ),
    ] = None,
    semester: Annotated[
        str | None,
        Query(
            pattern=r"^[0-9]{4}\.[0-9]$",
            description="Semestre das turmas, no formato AAAA.P. Sem ele, usa o mais recente gravado.",
        ),
    ] = None,
) -> list[CatalogSubject]:
    subjects = await service.search(
        q, code=code, unit=unit, semester=semester, sync=sync
    )
    no_store(response)
    return subjects
