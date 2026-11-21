from fastapi import APIRouter

from api.modules.classrooms.router import CLASSROOM_ERRORS
from api.modules.classrooms.week import LessonDay, WeekLessonsServiceDep
from api.modules.oauth.scopes import Scope, oauth
from api.modules.oauth.views import OAuthViewDep

router = APIRouter()


@router.get(
    "",
    openapi_extra=oauth(Scope.CLASSROOMS),
    response_model=list[LessonDay],
    summary="Consultar aulas da semana",
    description="Domingo a sábado da semana atual. Com OAuth, status e marked só aparecem com frequency:read.",
    responses={**CLASSROOM_ERRORS, 503: {"description": "Cache em atualização."}},
)
async def get_week_lessons(service: WeekLessonsServiceDep, view: OAuthViewDep):
    return view.lessons(await service.week())
