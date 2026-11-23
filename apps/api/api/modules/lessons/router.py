from fastapi import APIRouter, Response

from api.modules.classrooms.router import CLASSROOM_ERRORS
from api.modules.classrooms.week import LessonDay, WeekLessonsServiceDep
from api.modules.oauth import redaction
from api.modules.oauth.redaction import deliver
from api.modules.oauth.scopes import Scope, oauth
from api.sigaa import SigaaConnectionDep

router = APIRouter()


@router.get(
    "",
    openapi_extra=oauth(Scope.CLASSROOMS),
    response_model=list[LessonDay],
    summary="Consultar aulas da semana",
    description="Domingo a sábado da semana atual. Com OAuth, status e marked só aparecem com frequency:read.",
    responses={**CLASSROOM_ERRORS, 503: {"description": "Cache em atualização."}},
)
async def get_week_lessons(
    service: WeekLessonsServiceDep,
    connection: SigaaConnectionDep,
    response: Response,
) -> list[LessonDay] | Response:
    return deliver(await service.week(), connection.access, response, redaction.lessons)
