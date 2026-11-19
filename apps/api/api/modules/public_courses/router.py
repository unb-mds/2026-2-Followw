from typing import Annotated

from fastapi import APIRouter, Path, Query

from api.cache import NoStore
from api.modules.public_courses.service import (
    COURSES_PAGE_SIZE,
    CourseCurriculum,
    CoursePage,
    PublicCourse,
    PublicCourseServiceDep,
)
from api.schemas import SearchText, UnitFilter

router = APIRouter()


@router.get(
    "",
    response_model=CoursePage,
    summary="Buscar cursos cadastrados",
    description="Resultados paginados, em ordem alfabética.",
    responses={422: {"description": "Filtro inválido ou unidade inexistente."}},
    dependencies=[NoStore],
)
async def list_courses(
    service: PublicCourseServiceDep,
    q: Annotated[
        SearchText | None,
        Query(description="Termos do nome do curso."),
    ] = None,
    unit: Annotated[
        UnitFilter | None,
        Query(description="ID ou sigla da unidade."),
    ] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = COURSES_PAGE_SIZE,
) -> CoursePage:
    return await service.list_courses(q, unit, page, page_size)


@router.get(
    "/{course_id}",
    response_model=PublicCourse,
    summary="Consultar curso cadastrado",
    responses={404: {"description": "Curso inexistente."}},
    dependencies=[NoStore],
)
async def get_course(
    service: PublicCourseServiceDep,
    course_id: Annotated[
        int,
        Path(gt=0, le=2**31 - 1, description="ID do curso no Followw."),
    ],
) -> PublicCourse:
    return await service.get_course(course_id)


@router.get(
    "/{course_id}/curriculum",
    response_model=CourseCurriculum,
    summary="Consultar currículo do curso pelo ingresso",
    description="Matérias agrupadas por período, com optativas no período 0 e complementares em lista própria.",
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
            description="ID do curso no Followw.",
        ),
    ],
    entry_semester: Annotated[
        str,
        Query(
            pattern=r"^[0-9]{4}\.[0-9]$",
            description="Semestre de ingresso.",
        ),
    ],
    curriculum_sigaa_id: Annotated[
        int | None,
        Query(
            gt=0,
            description="ID da matriz no SIGAA, entre as de mesma vigência.",
        ),
    ] = None,
) -> CourseCurriculum:
    return await service.get_curriculum(course_id, entry_semester, curriculum_sigaa_id)
