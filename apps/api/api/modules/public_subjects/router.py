from typing import Annotated

from fastapi import APIRouter, Query, Response

from api.cache import no_store
from api.modules.public_classrooms.code import ClassroomCode
from api.modules.public_subjects.service import CatalogSubject, PublicSubjectServiceDep
from api.modules.public_subjects.statistics import (
    SubjectStatistics,
    SubjectStatisticsServiceDep,
)
from api.schemas import SearchText, UnitFilter
from api.sync import OptionalSyncDep

router = APIRouter()


@router.get(
    "/{code}/statistics",
    response_model=SubjectStatistics,
    summary="Estatísticas anteriores da matéria com os mesmos docentes",
    description="Média simples por turma com dados, por semestre e geral. Considera apenas semestres anteriores à turma indicada e o mesmo conjunto de docentes. A cobertura depende dos dados já coletados; não consulta o SIGAA.",
)
async def subject_statistics(
    code: ClassroomCode,
    service: SubjectStatisticsServiceDep,
    response: Response,
    semester: Annotated[str, Query(pattern=r"^[0-9]{4}\.[0-9]$")],
    number: Annotated[str, Query(min_length=1, max_length=32)],
) -> SubjectStatistics:
    result = await service.get(code, semester, number)
    no_store(response)
    return result


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
        SearchText | None,
        Query(
            description="Termos do código, nome do componente ou docente, de 3 a 32 caracteres; cada um precisa aparecer em algum deles, ignorando acentos e maiúsculas.",
        ),
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
