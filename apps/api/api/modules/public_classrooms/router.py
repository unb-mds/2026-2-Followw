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
        description="ID ou sigla exata da unidade, como 673 ou FCTE. Obrigatório quando code não for informado. Com code, restringe a busca a esta unidade. Consulte /public/classrooms/units para obter os IDs.",
    )
    semester: Annotated[
        str | None,
        Field(
            pattern=r"^[0-9]{4}\.[0-9]$",
            description="Opcional, no formato AAAA.P: 2026.2, 2027.1 ou 2026.4. Sem filtro, usa os valores do SIGAA.",
        ),
    ] = None
    q: str | None = Field(
        None,
        description="Trecho do nome ou código da disciplina, ou do nome de qualquer docente. Ignora acentos, maiúsculas e espaços extras. Filtra o resultado da unidade/semestre após consultar o SIGAA; vazio não filtra.",
    )
    local: str | None = Field(
        None,
        description="Trecho do local da turma, incluindo unidade e sala, como 'S3', 'FCTE - S3' ou 'auditorio'. Ignora acentos, maiúsculas e espaços extras; vazio não filtra. Com q, exige correspondência nos dois filtros.",
    )
    code: ClassroomCode | None = Field(
        None, description="Código completo da disciplina, como MAT0031 ou FGA0132."
    )
    number: Annotated[
        int | None,
        Field(
            ge=1,
            le=99,
            description="Número da turma, de 1 a 99. Aceita com ou sem zero à esquerda: '1' e '01' selecionam a mesma turma. Combina com os demais filtros; use code e semester para identificar a disciplina e o semestre. Sem correspondência, retorna lista vazia.",
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
    summary="Buscar turmas públicas do SIGAA, sem login",
    description="Consulta diretamente o SIGAA, sem filtrar o nível de ensino. Informe unit ou code. Sem unit, o prefixo de letras do código determina as unidades consultadas, pelas matérias conhecidas no banco; o código completo deve corresponder exatamente. Sem semester, preserva o ano/período do formulário do SIGAA. Com code, retorna 404 se não houver oferta nas unidades e no semestre consultados; isso não confirma que a disciplina inexiste. Se apenas number, q ou local excluir as turmas encontradas, retorna uma lista vazia (200).",
    responses={
        404: {
            "description": "Nenhuma turma do código completo nas unidades e no semestre consultados. A disciplina pode não existir ou não ter oferta nessas condições."
        },
        422: {
            "description": "Informe unit ou code. Filtro inválido ou unidade inexistente. Prefixo desconhecido pode não existir no SIGAA ou ainda não estar mapeado; informe unit para buscar diretamente."
        },
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
    summary="Consultar unidades disponíveis na busca pública de turmas",
    responses={502: {"description": "SIGAA indisponível ou resposta ilegível."}},
    dependencies=[NoStore],
)
async def list_units(
    service: PublicClassroomServiceDep,
    q: Annotated[
        str | None,
        Query(description="Filtra pelo nome, ignorando acentos e maiúsculas."),
    ] = None,
) -> list[UnitRef]:
    return await service.list_units(q)
