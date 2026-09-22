from fastapi import APIRouter
from sigaa_client import Classroom

from api.dependencies.sigaa import SigaaClient401Dep

router = APIRouter()


@router.get(
    "",
    response_model=list[Classroom],
    summary="Consultar as turmas atuais do usuário autenticado",
    responses={
        401: {"description": "Credenciais ausentes, inválidas ou erro do SIGAA."}
    },
)
async def get_classrooms(client: SigaaClient401Dep) -> list[Classroom]:
    return await client.classrooms.list_classrooms()
