from typing import Annotated, Self

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field, model_validator
from sigaa_client import PublicClassroom

from api.cache import NoStore
from api.modules.public_classrooms.code import ClassroomCode
from api.modules.public_classrooms.service import PublicClassroomServiceDep
from api.schemas import UnitFilter, UnitRef

router = APIRouter()


class ClassroomSearch(BaseModel):
    unit: UnitFilter | None = Field(
        None,
        description="ID ou sigla da unidade; obrigatório sem `code`. Consulte /public/classrooms/units.",
    )
    semester: Annotated[
        str | None,
        Field(
            pattern=r"^[0-9]{4}\.[0-9]$",
            description="Semestre da oferta.",
        ),
    ] = None
    q: str | None = Field(
        None,
        description="Trecho do nome ou código da matéria, ou do nome do docente.",
    )
    local: str | None = Field(
        None,
        description="Trecho do local da turma, incluindo unidade e sala.",
    )
    code: ClassroomCode | None = Field(
        None, description="Código completo da matéria; obrigatório sem `unit`."
    )
    number: Annotated[
        int | None,
        Field(
            ge=1,
            le=99,
            description="Número da turma.",
        ),
    ] = None

    @model_validator(mode="after")
    def _unit_or_code(self) -> Self:
        if self.unit is None and self.code is None:
            raise ValueError(
                "Informe `unit` ou o código completo da disciplina em `code`."
            )
        return self


@router.get(
    "",
    response_model=list[PublicClassroom],
    summary="Buscar turmas no SIGAA",
    description="Consulta as ofertas diretamente no SIGAA, em todos os níveis de ensino.",
    responses={
        404: {
            "description": "Nenhuma oferta encontrada nas unidades e no semestre consultados."
        },
        422: {"description": "Filtros inválidos ou unidade não identificada."},
        502: {"description": "SIGAA indisponível ou resposta ilegível."},
    },
    dependencies=[NoStore],
)
async def search_classrooms(
    service: PublicClassroomServiceDep,
    query: Annotated[ClassroomSearch, Query()],
) -> list[PublicClassroom]:
    return await service.search(
        query.unit,
        query.semester,
        q=query.q,
        local=query.local,
        code=query.code,
        number=query.number,
    )


@router.get(
    "/units",
    response_model=list[UnitRef],
    summary="Listar unidades do SIGAA",
    responses={502: {"description": "SIGAA indisponível ou resposta ilegível."}},
    dependencies=[NoStore],
)
async def list_units(
    service: PublicClassroomServiceDep,
    q: Annotated[
        str | None,
        Query(description="Trecho do nome da unidade."),
    ] = None,
) -> list[UnitRef]:
    return await service.list_units(q)
