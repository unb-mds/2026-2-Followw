from typing import Annotated

from fastapi import APIRouter, Path, Query

from api.cache import NoStore
from api.modules.public_courses.service import (
    CourseCurriculum,
    CurriculumConflict,
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
        "Seleciona, entre as matrizes ativas cadastradas, a vigência mais recente anterior ou igual ao ingresso. "
        "Se não houver, usa a mais antiga disponível e sinaliza fallback_used. "
        "Em caso de empate, retorna 409 com as opções; repita a consulta com curriculum_sigaa_id. "
        "As matérias vêm agrupadas por período, com optativas no período 0 e complementares em uma lista própria. "
        "Nome, carga horária e requisitos vêm do catálogo gravado; dados ausentes ficam nulos. Não consulta o SIGAA."
    ),
    responses={
        404: {
            "description": "Curso inexistente, sem currículo ativo ou matriz indisponível para o ingresso."
        },
        409: {
            "model": CurriculumConflict,
            "description": "Várias matrizes com a mesma vigência; escolha uma das opções.",
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
            description="ID da matriz no SIGAA, escolhido entre as opções retornadas no 409.",
        ),
    ] = None,
) -> CourseCurriculum:
    return await service.get_curriculum(course_id, entry_semester, curriculum_sigaa_id)
