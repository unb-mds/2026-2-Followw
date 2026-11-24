import base64
import binascii
from typing import Annotated, Literal
from urllib.parse import unquote_plus
from uuid import UUID

from fastapi import APIRouter, Form, Header, Path, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, SecretStr

from api.cache import NoStore
from api.core.config import settings
from api.db.main import DatabaseDep
from api.errors import SIGAA_ERRORS
from api.modules.auth.account import schedule_account_sync
from api.modules.oauth.clients import (
    InvalidClient,
    OAuthClientCreate,
    OAuthClientCreated,
    OAuthClientSecret,
    OAuthClientUpdate,
    OAuthClientView,
    OAuthGrantView,
    authenticate_client,
    create_client,
    delete_client,
    list_clients,
    list_grants,
    revoke_grant,
    rotate_client_secret,
    update_client,
)
from api.modules.oauth.proof import MAX_PROOF_LENGTH, InvalidProof, Proof
from api.modules.oauth.tokens import MAX_TOKEN_LENGTH, InvalidToken, renew_access
from api.sigaa import SigaaConnectionDep
from api.sync.queue import JobQueueDep

router = APIRouter()


class RefreshGrant(BaseModel):
    grant_type: Literal["refresh_token"]
    client_id: str | None = Field(default=None, min_length=1, max_length=256)
    client_secret: SecretStr | None = Field(default=None, min_length=1, max_length=256)
    refresh_token: SecretStr = Field(min_length=1, max_length=MAX_TOKEN_LENGTH)


class TokenResponse(BaseModel):
    access_token: str = Field(repr=False)
    token_type: Literal["Bearer"] = "Bearer"
    expires_in: int
    scope: str


def _parse_basic_auth(header: str) -> tuple[str, str]:
    scheme, _, encoded = header.partition(" ")
    if scheme.lower() != "basic" or not encoded:
        raise InvalidClient("Cabeçalho Authorization inválido.")
    try:
        decoded = base64.b64decode(encoded, validate=True).decode("utf-8")
    except (binascii.Error, UnicodeDecodeError) as error:
        raise InvalidClient("Credenciais Basic inválidas.") from error
    if ":" not in decoded:
        raise InvalidClient("Credenciais Basic incompletas.")
    raw_id, raw_secret = decoded.split(":", 1)
    client_id, client_secret = unquote_plus(raw_id), unquote_plus(raw_secret)
    if not client_id or not client_secret:
        raise InvalidClient("Credenciais Basic vazias.")
    return client_id, client_secret


def _client_credentials(
    body: RefreshGrant, authorization: str | None
) -> tuple[str, str | None]:
    if authorization is not None:
        basic_id, basic_secret = _parse_basic_auth(authorization)
        if body.client_secret is not None or (
            body.client_id is not None and body.client_id != basic_id
        ):
            raise InvalidClient("Não combine múltiplos métodos de autenticação.")
        return basic_id, basic_secret
    if body.client_id is None:
        raise InvalidClient("Informe o client_id.")
    secret = body.client_secret.get_secret_value() if body.client_secret else None
    return body.client_id, secret


@router.post(
    "/token",
    response_model=TokenResponse,
    summary="Renovar o acesso OAuth de uma aplicação registrada",
    description=(
        "Valida a aplicação cadastrada: clientes confidenciais autenticam com client_secret "
        "(formulário ou HTTP Basic) e clientes públicos exigem prova DPoP."
    ),
    responses={
        400: {"description": "Refresh ou prova DPoP inválidos."},
        401: {"description": "Aplicação não registrada ou client_secret inválido."},
        502: {"description": "SIGAA indisponível durante a renovação."},
    },
)
async def refresh(
    body: Annotated[RefreshGrant, Form()],
    db: DatabaseDep,
    queue: JobQueueDep,
    response: Response,
    dpop: Annotated[str | None, Header(max_length=MAX_PROOF_LENGTH)] = None,
    authorization: Annotated[str | None, Header(max_length=1024)] = None,
):
    headers = {"Cache-Control": "no-store", "Pragma": "no-cache"}
    try:
        client_id, client_secret = _client_credentials(body, authorization)
        if client_secret is None and dpop is None:
            raise InvalidProof("Prova DPoP ausente.")
        client = await authenticate_client(db, client_id, client_secret)
        proof = (
            Proof.verify(dpop, f"{settings.public_url.rstrip('/')}/oauth/token")
            if dpop is not None
            else None
        )
        pair = await renew_access(
            db,
            body.refresh_token.get_secret_value(),
            client_id=client.id,
            authenticated_client=client.confidential,
            proof=proof,
        )
    except InvalidClient:
        error_headers = (
            {**headers, "WWW-Authenticate": "Basic"}
            if authorization is not None
            else headers
        )
        return JSONResponse(
            {"error": "invalid_client"}, status_code=401, headers=error_headers
        )
    except InvalidProof:
        return JSONResponse(
            {"error": "invalid_dpop_proof"}, status_code=400, headers=headers
        )
    except InvalidToken:
        return JSONResponse(
            {"error": "invalid_grant"}, status_code=400, headers=headers
        )
    # Como no refresh da web: agenda o sync da conta do que venceu.
    await schedule_account_sync(pair.credentials, db, queue)
    response.headers.update(headers)
    return TokenResponse(
        access_token=pair.access_token,
        expires_in=pair.expires_in,
        scope=" ".join(pair.scopes),
    )


ClientId = Annotated[str, Path(min_length=1, max_length=128)]


@router.get(
    "/clients",
    response_model=list[OAuthClientView],
    summary="Listar aplicações OAuth do desenvolvedor",
    responses=SIGAA_ERRORS,
    dependencies=[NoStore],
)
async def get_oauth_clients(
    connection: SigaaConnectionDep, db: DatabaseDep
) -> list[OAuthClientView]:
    return await list_clients(db, connection.registration)


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
    body: OAuthClientCreate, connection: SigaaConnectionDep, db: DatabaseDep
) -> OAuthClientCreated:
    return await create_client(db, connection.registration, body)


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
    connection: SigaaConnectionDep,
    db: DatabaseDep,
) -> OAuthClientView:
    return await update_client(db, connection.registration, client_id, body)


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
    client_id: ClientId, connection: SigaaConnectionDep, db: DatabaseDep
) -> OAuthClientSecret:
    return await rotate_client_secret(db, connection.registration, client_id)


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
    client_id: ClientId, connection: SigaaConnectionDep, db: DatabaseDep
) -> None:
    await delete_client(db, connection.registration, client_id)


@router.get(
    "/grants",
    response_model=list[OAuthGrantView],
    summary="Listar aplicações autorizadas pelo usuário",
    responses=SIGAA_ERRORS,
    dependencies=[NoStore],
)
async def get_oauth_grants(
    connection: SigaaConnectionDep, db: DatabaseDep
) -> list[OAuthGrantView]:
    return await list_grants(db, connection.registration)


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
async def delete_oauth_grant(
    grant_id: UUID, connection: SigaaConnectionDep, db: DatabaseDep
) -> None:
    await revoke_grant(db, connection.registration, grant_id)
