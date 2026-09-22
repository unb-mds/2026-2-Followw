from fastapi import APIRouter
from sigaa_client import Classroom

from api.dependencies.sigaa import SigaaClientDep

router = APIRouter()


@router.get(
    "",
    response_model=list[Classroom],
    summary="Consultar as turmas atuais do usuário autenticado",
    responses={
        401: {"description": "Credenciais ausentes ou inválidas."},
        502: {"description": "SIGAA indisponível."},
    },
)
async def get_classrooms(client: SigaaClientDep) -> list[Classroom]:
    return await client.classrooms.list_classrooms()
