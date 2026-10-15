from typing import Annotated

from fastapi import APIRouter, Path, Query

from api.cache import NoStore
from api.modules.public_courses.service import (
    CourseCurriculum,
    PublicCourse,
    PublicCourseServiceDep,
)

router = APIRouter()


@router.get(
    "",
    response_model=list[PublicCourse],
    summary="Listar cursos cadastrados",
    description=(
        "Lista os cursos gravados no Followw, ordenados por nome e ID local, sem autenticação. "
        "Inclui cursos sem currículo e os criados pelo sync, cujo sigaa_id pode ser nulo. "
        "O campo id é o course_id usado na consulta de currículo; unity traz a sigla da unidade "
        "e shift preserva o turno cadastrado, como no perfil. Banco sem cursos retorna lista vazia."
    ),
    dependencies=[NoStore],
)
async def list_courses(service: PublicCourseServiceDep) -> list[PublicCourse]:
    return await service.list_courses()


@router.get(
    "/{course_id}/curriculum",
    response_model=CourseCurriculum,
    summary="Consultar currículo do curso pelo ingresso",
    description=(
        "Seleciona, entre as matrizes ativas cadastradas, a vigência mais recente anterior ou igual ao ingresso; "
        "antes da primeira vigência, usa a mais antiga. "
        "Entre matrizes da mesma vigência, vale a de maior revisão do código, salvo se curriculum_sigaa_id escolher outra. "
        "As matérias vêm agrupadas por período, com optativas no período 0 e complementares em uma lista própria. "
        "Nome, carga horária e requisitos vêm do catálogo gravado; dados ausentes ficam nulos. Não consulta o SIGAA."
    ),
    responses={
        404: {
            "description": "Curso inexistente, sem currículo ativo ou matriz indisponível para o ingresso."
        },
    },
    dependencies=[NoStore],
)
async def get_curriculum(
    service: PublicCourseServiceDep,
    course_id: Annotated[
        int,
        Path(
            gt=0,
            description="ID local do curso no Followw (courses.id), distinto do ID do SIGAA.",
        ),
    ],
    entry_semester: Annotated[
        str,
        Query(
            pattern=r"^[0-9]{4}\.[0-9]$",
            description="Semestre de ingresso, no formato AAAA.P.",
        ),
    ],
    curriculum_sigaa_id: Annotated[
        int | None,
        Query(
            gt=0,
            description="ID no SIGAA de outra matriz com a mesma vigência selecionada.",
        ),
    ] = None,
) -> CourseCurriculum:
    return await service.get_curriculum(course_id, entry_semester, curriculum_sigaa_id)
