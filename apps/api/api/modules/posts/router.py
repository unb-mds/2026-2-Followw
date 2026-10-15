from fastapi import APIRouter
from sigaa_client import DashboardPost

from api.cache import NoStore
from api.errors import SIGAA_ERRORS
from api.sigaa import SigaaClientDep

router = APIRouter()


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
