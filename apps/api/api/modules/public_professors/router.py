from typing import Annotated

from fastapi import APIRouter, Path, Query
from pydantic import StringConstraints

from api.cache import NoStore
from api.modules.public_professors.service import (
    ProfessorDetails,
    ProfessorPage,
    ProfessorServiceDep,
)

router = APIRouter()


@router.get(
    "",
    response_model=ProfessorPage,
    summary="Buscar docentes do catálogo público",
    description="Lista docentes coletados do SIGAA, sem login. Nome, unidade e semestre se combinam. O semestre seleciona docentes que ministraram uma disciplina de graduação naquele período.",
    dependencies=[NoStore],
)
async def list_professors(
    service: ProfessorServiceDep,
    q: Annotated[
        str | None,
        Query(
            min_length=4,
            max_length=100,
            pattern=r"^[^\x00-\x1f\x7f]+$",
            description="Trecho do nome, com ao menos 4 caracteres; ignora acentos e caixa.",
        ),
        StringConstraints(strip_whitespace=True),
    ] = None,
    unity_id: Annotated[
        int | None,
        Query(gt=0, le=2**31 - 1, description="ID da unidade no SIGAA."),
    ] = None,
    semester: Annotated[
        str | None,
        Query(
            pattern=r"^[0-9]{4}(?:\.[0-9])?$",
            description="Período de graduação, como 2026.2; registros antigos podem vir só com o ano.",
        ),
    ] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 50,
) -> ProfessorPage:
    return await service.list(q, unity_id, semester, page, page_size)


@router.get(
    "/{siape}",
    response_model=ProfessorDetails,
    summary="Consultar o perfil público de um docente",
    dependencies=[NoStore],
)
async def get_professor(
    service: ProfessorServiceDep,
    siape: Annotated[
        int, Path(gt=0, le=2**31 - 1, description="SIAPE do link público do SIGAA.")
    ],
) -> ProfessorDetails:
    return await service.get(siape)
