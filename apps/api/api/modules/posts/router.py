from fastapi import APIRouter
from sigaa_client import DashboardPost

from api.cache import NoStore
from api.errors import SIGAA_ERRORS
from api.modules.classrooms.posts import ClassroomPostsServiceDep, LatestNewsFeed
from api.sigaa import SigaaClientDep

router = APIRouter()


@router.get(
    "/news",
    response_model=LatestNewsFeed,
    summary="Consultar notícias recentes das turmas atuais",
    description="Até cinco notícias. updating indica atualização pendente; texto e anexos completos ficam no detalhe do post.",
    responses=SIGAA_ERRORS,
)
async def get_latest_news(service: ClassroomPostsServiceDep) -> LatestNewsFeed:
    return await service.latest_news()


@router.get(
    "",
    response_model=list[DashboardPost],
    summary="Consultar posts da home do SIGAA",
    description="Notícias e avaliações das turmas atuais. Consulte os detalhes em /classrooms/{classroom_sigaa_id}/posts.",
    responses=SIGAA_ERRORS,
    dependencies=[NoStore],
)
async def get_posts(client: SigaaClientDep) -> list[DashboardPost]:
    return await client.classrooms.list_dashboard_posts()
