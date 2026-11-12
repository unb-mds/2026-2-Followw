from fastapi import APIRouter

from api.modules.classrooms.router import CLASSROOM_ERRORS
from api.modules.classrooms.week import LessonDay, WeekLessonsServiceDep

router = APIRouter()


@router.get(
    "",
    response_model=list[LessonDay],
    summary="Consultar aulas da semana",
    description="Segunda a domingo da semana atual, com a situação do aluno em cada aula das turmas atuais.",
    responses={**CLASSROOM_ERRORS, 503: {"description": "Cache em atualização."}},
)
async def get_week_lessons(service: WeekLessonsServiceDep) -> list[LessonDay]:
    return await service.week()
