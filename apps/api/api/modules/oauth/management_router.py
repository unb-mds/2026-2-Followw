from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path

from api.cache import NoStore
from api.db.main import DatabaseDep
from api.errors import SIGAA_ERRORS
from api.modules.oauth.clients import (
    OAuthClientCreate,
    OAuthClientCreated,
    OAuthClientSecret,
    OAuthClientUpdate,
    OAuthClientView,
    OAuthGrantView,
    create_client,
    delete_client,
    list_clients,
    list_grants,
    resolve_user_id,
    rotate_client_secret,
    update_client,
)
from api.modules.oauth.tokens import (
    revoke,
)
from api.sigaa import SigaaConnectionDep

router = APIRouter()

ClientId = Annotated[str, Path(min_length=1, max_length=128)]


async def _user_id(connection: SigaaConnectionDep, db: DatabaseDep) -> UUID:
    return await resolve_user_id(db, connection.registration)


UserId = Annotated[UUID, Depends(_user_id)]


@router.get(
    "/clients",
    response_model=list[OAuthClientView],
    summary="Listar aplicações OAuth do desenvolvedor",
    responses=SIGAA_ERRORS,
    dependencies=[NoStore],
)
async def get_oauth_clients(owner_id: UserId, db: DatabaseDep) -> list[OAuthClientView]:
    return await list_clients(db, owner_id)


@router.post(
    "/clients",
    status_code=201,
    response_model=OAuthClientCreated,
    summary="Cadastrar uma nova aplicação OAuth",
    description="Aplicações confidenciais recebem o client_secret uma única vez na resposta.",
    responses={
        **SIGAA_ERRORS,
        422: {"description": "Dados inválidos ou limite de aplicações atingido."},
    },
    dependencies=[NoStore],
)
async def post_oauth_client(
    body: OAuthClientCreate, owner_id: UserId, db: DatabaseDep
) -> OAuthClientCreated:
    return await create_client(db, owner_id, body)


@router.patch(
    "/clients/{client_id}",
    response_model=OAuthClientView,
    summary="Atualizar uma aplicação OAuth",
    responses={
        **SIGAA_ERRORS,
        404: {"description": "Aplicação não encontrada."},
        422: {"description": "Dados inválidos."},
    },
    dependencies=[NoStore],
)
async def patch_oauth_client(
    client_id: ClientId,
    body: OAuthClientUpdate,
    owner_id: UserId,
    db: DatabaseDep,
) -> OAuthClientView:
    return await update_client(db, owner_id, client_id, body)


@router.post(
    "/clients/{client_id}/rotate-secret",
    response_model=OAuthClientSecret,
    summary="Gerar novo client_secret para uma aplicação confidencial",
    description="Invalida o segredo anterior imediatamente e retorna o novo uma única vez.",
    responses={
        **SIGAA_ERRORS,
        404: {"description": "Aplicação não encontrada."},
        422: {"description": "Aplicações públicas não possuem client_secret."},
    },
    dependencies=[NoStore],
)
async def post_rotate_oauth_client_secret(
    client_id: ClientId, owner_id: UserId, db: DatabaseDep
) -> OAuthClientSecret:
    return await rotate_client_secret(db, owner_id, client_id)


@router.delete(
    "/clients/{client_id}",
    status_code=204,
    summary="Excluir uma aplicação OAuth",
    description="Remove a aplicação e revoga todas as autorizações vinculadas a ela.",
    responses={
        **SIGAA_ERRORS,
        404: {"description": "Aplicação não encontrada."},
    },
    dependencies=[NoStore],
)
async def delete_oauth_client(
    client_id: ClientId, owner_id: UserId, db: DatabaseDep
) -> None:
    await delete_client(db, owner_id, client_id)


@router.get(
    "/grants",
    response_model=list[OAuthGrantView],
    summary="Listar aplicações autorizadas pelo usuário",
    responses=SIGAA_ERRORS,
    dependencies=[NoStore],
)
async def get_oauth_grants(user_id: UserId, db: DatabaseDep) -> list[OAuthGrantView]:
    return await list_grants(db, user_id)


@router.delete(
    "/grants/{grant_id}",
    status_code=204,
    summary="Revogar a autorização de uma aplicação",
    responses={
        **SIGAA_ERRORS,
        404: {"description": "Autorização não encontrada."},
    },
    dependencies=[NoStore],
)
async def delete_oauth_grant(grant_id: UUID, user_id: UserId, db: DatabaseDep) -> None:
    if not await revoke(db, grant_id, user_id=user_id):
        raise HTTPException(404, "Autorização não encontrada.")
