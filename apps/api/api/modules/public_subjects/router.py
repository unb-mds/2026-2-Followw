from typing import Annotated

from fastapi import APIRouter, Query
from pydantic import StringConstraints

from api.cache import NoStore
from api.modules.public_classrooms.code import CLASSROOM_CODE_PATTERN
from api.modules.public_subjects.service import CatalogSubject, PublicSubjectServiceDep

router = APIRouter()


@router.get(
    "",
    response_model=list[CatalogSubject],
    summary="Buscar matérias com suas turmas",
    description="Consulta os componentes e turmas gravados no Followw, sem ir ao SIGAA. Informe ao menos q, code ou unit; os filtros se combinam. Cada componente traz as turmas do semestre consultado, vazias se não houver oferta.",
    responses={
        422: {
            "description": "Nenhum filtro informado, filtro inválido, unidade inexistente ou nome de unidade ambíguo."
        },
    },
    dependencies=[NoStore],
)
async def search_subjects(
    service: PublicSubjectServiceDep,
    q: Annotated[
        str | None,
        Query(
            min_length=3,
            max_length=24,
            pattern=r"\S",
            description="Trecho do código, nome do componente ou docente, de 3 a 24 caracteres, ignorando acentos, maiúsculas e espaços extras.",
        ),
        StringConstraints(strip_whitespace=True),
    ] = None,
    code: Annotated[
        str | None,
        Query(
            pattern=CLASSROOM_CODE_PATTERN,
            description="Código completo do componente, como FGA0003.",
        ),
    ] = None,
    unit: Annotated[
        str | None,
        Query(
            min_length=1,
            pattern=r"\S",
            description="ID ou código exato da unidade responsável, como 673 ou FCTE.",
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
    return await service.search(q, code=code, unit=unit, semester=semester)
