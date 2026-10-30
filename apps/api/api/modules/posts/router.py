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
    summary="Consultar até cinco notícias recentes das turmas atuais",
    description="Retorna imediatamente as notícias disponíveis no banco, com IDs e o conteúdo já salvo. Listas vencidas são sincronizadas num job por turma, sem bloquear a resposta; o conteúdo de cada notícia segue sob demanda pelo detalhe da postagem. updating indica listas pendentes. A identidade é o par turma e ID do post.",
    responses=SIGAA_ERRORS,
)
async def get_latest_news(service: ClassroomPostsServiceDep) -> LatestNewsFeed:
    return await service.latest_news()


@router.get(
    "",
    response_model=list[DashboardPost],
    summary="Consultar posts recentes das turmas na home do SIGAA",
    description="Notícias recentes e avaliações agendadas das turmas atuais, sem cache. A home não traz IDs: o detalhe fica em /classrooms/{classroom_sigaa_id}/posts. Avaliação de disciplina não encontrada entre as turmas do portal vem com classroom_sigaa_id null.",
    responses=SIGAA_ERRORS,
    dependencies=[NoStore],
)
async def get_posts(client: SigaaClientDep) -> list[DashboardPost]:
    return await client.classrooms.list_dashboard_posts()
