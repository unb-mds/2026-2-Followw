from fastapi import APIRouter, Response

from api.errors import SIGAA_ERRORS
from api.modules.classrooms.posts import ClassroomPostsServiceDep, PostsFeed
from api.modules.oauth import redaction
from api.modules.oauth.redaction import deliver
from api.modules.oauth.scopes import Scope, oauth
from api.sigaa import SigaaConnectionDep

router = APIRouter()


@router.get(
    "",
    openapi_extra=oauth(Scope.POSTS),
    response_model=PostsFeed,
    summary="Consultar notícias recentes e próximas avaliações das turmas atuais",
    description=(
        "Até cinco notícias e todas as avaliações futuras, nessa ordem (`post.type`). updating indica atualização pendente. "
        "Com OAuth, `classroom` omite `grade` sem `grades:read`."
    ),
    responses=SIGAA_ERRORS,
)
async def get_posts(
    service: ClassroomPostsServiceDep,
    connection: SigaaConnectionDep,
    response: Response,
) -> PostsFeed | Response:
    return deliver(
        await service.latest_posts(), connection.access, response, redaction.posts_feed
    )
