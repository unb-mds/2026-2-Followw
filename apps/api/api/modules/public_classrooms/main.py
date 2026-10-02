from typing import Annotated

from fastapi import APIRouter, Query
from sigaa_client import PublicClassroom, Unit

from api.dependencies.cache import NoStore
from api.services.public_classroom import PublicClassroomServiceDep
from api.utils.classroom_code import CLASSROOM_CODE_PATTERN

router = APIRouter()


@router.get(
    "",
    response_model=list[PublicClassroom],
    summary="Buscar turmas públicas do SIGAA, sem login",
    description="Consulta diretamente o SIGAA, sem filtrar o nível de ensino. Informe unit ou code. Sem unit, o prefixo de letras do código determina as unidades consultadas pelo índice local; o código completo deve corresponder exatamente. Sem semester, preserva o ano/período do formulário do SIGAA. Com code, retorna 404 se não houver oferta nas unidades e no semestre consultados; isso não confirma que a disciplina inexiste. Se apenas number, contains ou local excluir as turmas encontradas, retorna uma lista vazia (200).",
    responses={
        404: {
            "description": "Nenhuma turma do código completo nas unidades e no semestre consultados. A disciplina pode não existir ou não ter oferta nessas condições."
        },
        422: {
            "description": "Informe unit ou code. Filtro inválido, unidade inexistente ou nome ambíguo. Prefixo ausente do índice pode não existir no SIGAA ou ainda não estar mapeado; informe unit para buscar diretamente."
        },
        502: {"description": "SIGAA indisponível ou resposta ilegível."},
    },
    dependencies=[NoStore],
)
async def search_classrooms(
    service: PublicClassroomServiceDep,
    unit: Annotated[
        str | None,
        Query(
            min_length=1,
            pattern=r"\S",
            description="ID da unidade ou parte do nome, como 'gama'. Obrigatório quando code não for informado. Com code, restringe a busca a esta unidade. Consulte /public/classrooms/units para obter os IDs.",
        ),
    ] = None,
    semester: Annotated[
        str | None,
        Query(
            pattern=r"^[0-9]{4}\.[0-9]$",
            description="Opcional, no formato AAAA.P: 2026.2, 2027.1 ou 2026.4. Sem filtro, usa os valores do SIGAA.",
        ),
    ] = None,
    contains: Annotated[
        str | None,
        Query(
            description="Trecho do nome ou código da disciplina, ou do nome de qualquer docente. Ignora acentos, maiúsculas e espaços extras. Filtra o resultado da unidade/semestre após consultar o SIGAA; vazio não filtra.",
        ),
    ] = None,
    local: Annotated[
        str | None,
        Query(
            description="Trecho do local da turma, incluindo unidade e sala, como 'S3', 'FCTE - S3' ou 'auditorio'. Ignora acentos, maiúsculas e espaços extras; vazio não filtra. Com contains, exige correspondência nos dois filtros.",
        ),
    ] = None,
    code: Annotated[
        str | None,
        Query(
            pattern=CLASSROOM_CODE_PATTERN,
            description="Código completo da disciplina, como MAT0031 ou FGA0132. Ignora maiúsculas e espaços nas extremidades; preserva zeros. Sem unit, consulta todas as unidades mapeadas para o prefixo. Combina com semester, number, contains e local.",
        ),
    ] = None,
    number: Annotated[
        int | None,
        Query(
            ge=1,
            le=99,
            description="Número da turma, de 1 a 99. Aceita com ou sem zero à esquerda: '1' e '01' selecionam a mesma turma. Combina com os demais filtros; use code e semester para identificar a disciplina e o semestre. Sem correspondência, retorna lista vazia.",
        ),
    ] = None,
) -> list[PublicClassroom]:
    return await service.search(
        unit, semester, contains=contains, local=local, code=code, number=number
    )


@router.get(
    "/units",
    response_model=list[Unit],
    summary="Consultar unidades disponíveis na busca pública de turmas",
    responses={502: {"description": "SIGAA indisponível ou resposta ilegível."}},
    dependencies=[NoStore],
)
async def list_units(
    service: PublicClassroomServiceDep,
    contains: Annotated[
        str | None,
        Query(description="Filtra pelo nome, ignorando acentos e maiúsculas."),
    ] = None,
) -> list[Unit]:
    return await service.list_units(contains)
