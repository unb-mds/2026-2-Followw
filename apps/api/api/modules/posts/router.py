from fastapi import APIRouter, Response
from sigaa_client import DashboardPost

from api.cache import NoStore
from api.errors import SIGAA_ERRORS
from api.modules.classrooms.posts import ClassroomPostsServiceDep, LatestNewsFeed
from api.modules.oauth import redaction
from api.modules.oauth.redaction import deliver
from api.modules.oauth.scopes import Scope, oauth
from api.sigaa import SigaaClientDep, SigaaConnectionDep

router = APIRouter()


@router.get(
    "/news",
    openapi_extra=oauth(Scope.POSTS),
    response_model=LatestNewsFeed,
    summary="Consultar notícias recentes das turmas atuais",
    description=(
        "Até cinco notícias. updating indica atualização pendente; texto e anexos completos ficam no detalhe do post. "
        "Com OAuth, `classroom` traz só `id` e `sigaa_id` sem `classrooms:read`, e omite `grade` sem `grades:read`."
    ),
    responses=SIGAA_ERRORS,
)
async def get_latest_news(
    service: ClassroomPostsServiceDep,
    connection: SigaaConnectionDep,
    response: Response,
) -> LatestNewsFeed | Response:
    return deliver(
        await service.latest_news(), connection.access, response, redaction.news
    )


@router.get(
    "",
    openapi_extra=oauth(Scope.POSTS),
    response_model=list[DashboardPost],
    summary="Consultar posts da home do SIGAA",
    description="Notícias e avaliações das turmas atuais. Consulte os detalhes em /classrooms/{classroom_sigaa_id}/posts.",
    responses=SIGAA_ERRORS,
    dependencies=[NoStore],
)
async def get_posts(client: SigaaClientDep) -> list[DashboardPost]:
    return await client.classrooms.list_dashboard_posts()
