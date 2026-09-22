from typing import Annotated

from fastapi import APIRouter, Query
from sigaa_client import Classroom

from api.dependencies.sigaa import SigaaClientDep

router = APIRouter()


@router.get(
    "",
    response_model=list[Classroom],
    summary="Consultar as turmas do usuário autenticado",
    responses={
        401: {"description": "Credenciais ausentes ou inválidas."},
        502: {"description": "SIGAA indisponível."},
    },
)
async def get_classrooms(
    client: SigaaClientDep,
    semester: Annotated[
        str | None,
        Query(
            pattern=r"^(all|[0-9]{4}\.[0-9])$",
            description="Sem filtro: turmas atuais. Use 'all' ou um semestre no formato AAAA.P, como 2026.2.",
        ),
    ] = None,
) -> list[Classroom]:
    if semester is None:
        return await client.classrooms.list_classrooms()

    classrooms = await client.classrooms.list_all_classrooms()
    if semester == "all":
        return classrooms
    return [classroom for classroom in classrooms if classroom.semester == semester]
