from collections.abc import Callable
from typing import TYPE_CHECKING, Any

from fastapi import Response
from fastapi.responses import JSONResponse
from pydantic_core import to_jsonable_python

from api.db.models import User
from api.modules.oauth.scopes import AccessPolicy, Scope
from api.schemas import course_ref

if TYPE_CHECKING:
    from api.modules.classrooms.frequency import ClassroomFrequencyResult
    from api.modules.classrooms.posts import PostsFeed
    from api.modules.classrooms.service import ParticipantClassroom
    from api.modules.classrooms.week import LessonDay

type Shape[T] = Callable[[T, AccessPolicy], Any]


def deliver[T](
    full: T, access: AccessPolicy, response: Response, shape: Shape[T]
) -> T | JSONResponse:
    """A web recebe o modelo completo; o OAuth, só o que o aceite cobre."""
    if not access.delegated:
        return full
    return json_response(shape(full, access), response)


def json_response(payload: Any, response: Response) -> JSONResponse:
    """Preserva os cabeçalhos de cache (`Cache-Control`, `Age`) da resposta injetada."""
    return JSONResponse(to_jsonable_python(payload), headers=response.headers)


def classroom(room: ParticipantClassroom, access: AccessPolicy) -> dict[str, Any]:
    hidden = None if access.allows(Scope.GRADES) else {"grade"}
    return room.model_dump(mode="json", exclude=hidden)


def classrooms(
    rooms: list[ParticipantClassroom], access: AccessPolicy
) -> list[dict[str, Any]]:
    return [classroom(room, access) for room in rooms]


def frequencies(
    results: list[ClassroomFrequencyResult], access: AccessPolicy
) -> list[dict[str, Any]]:
    return [
        {
            "classroom": classroom(result.classroom, access),
            "frequency": result.frequency.model_dump(mode="json"),
        }
        for result in results
    ]


def posts_feed(feed: PostsFeed, access: AccessPolicy) -> dict[str, Any]:
    return {
        "items": [
            {
                "classroom": classroom(item.classroom, access),
                "post": item.post.model_dump(mode="json"),
            }
            for item in feed.items
        ],
        "updating": feed.updating,
    }


def lessons(days: list[LessonDay], access: AccessPolicy) -> list[dict[str, Any]]:
    hidden = (
        None
        if access.allows(Scope.FREQUENCY)
        else {"lessons": {"__all__": {"status", "marked"}}}
    )
    return [day.model_dump(mode="json", exclude=hidden) for day in days]


def profile(user: User, access: AccessPolicy) -> dict[str, Any]:
    """Leitura leve do perfil: não carrega o histórico nem a matriz."""
    assert user.registration
    data: dict[str, Any] = {
        "name": user.name,
        "registration": user.registration,
        "photo": user.photo,
        "course": course_ref(user.course),
    }
    if access.allows(Scope.GRADES):
        data["ira"] = user.ira
        data["mp"] = user.mp
    return data
