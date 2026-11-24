from base64 import b64decode
from typing import Annotated, Literal
from urllib.parse import unquote_plus

from fastapi import APIRouter, Form, Header, Request
from pydantic import BaseModel, Field, SecretStr

from api.core.config import settings
from api.db.main import Database, DatabaseDep
from api.modules.auth.account import schedule_account_sync
from api.modules.oauth.applications import MAX_REDIRECT_URI_LENGTH, InvalidClient
from api.modules.oauth.authorization import exchange_code
from api.modules.oauth.proof import MAX_PROOF_LENGTH, InvalidProof, Proof
from api.modules.oauth.protocol import OAuthError, OAuthProblem, ProtocolRoute
from api.modules.oauth.tokens import (
    MAX_TOKEN_LENGTH,
    InvalidToken,
    TokenPair,
    renew_access,
)
from api.sync.queue import JobQueueDep

router = APIRouter(route_class=ProtocolRoute)
_MAX_CLIENT_FIELD_LENGTH = 256


class TokenRequest(BaseModel):
    grant_type: str = Field(
        min_length=1,
        max_length=64,
        description="`authorization_code` ou `refresh_token`.",
    )
    client_id: str | None = Field(
        default=None, min_length=1, max_length=_MAX_CLIENT_FIELD_LENGTH
    )
    client_secret: SecretStr | None = Field(
        default=None, min_length=1, max_length=_MAX_CLIENT_FIELD_LENGTH
    )
    code: SecretStr | None = Field(
        default=None, min_length=1, max_length=MAX_TOKEN_LENGTH
    )
    redirect_uri: str | None = Field(
        default=None, min_length=1, max_length=MAX_REDIRECT_URI_LENGTH
    )
    code_verifier: SecretStr | None = Field(default=None, min_length=43, max_length=128)
    refresh_token: SecretStr | None = Field(
        default=None, min_length=1, max_length=MAX_TOKEN_LENGTH
    )


class TokenResponse(BaseModel):
    access_token: str = Field(repr=False)
    refresh_token: str | None = Field(default=None, repr=False)
    token_type: Literal["Bearer"] = "Bearer"
    expires_in: int
    scope: str


def _client_credentials(
    body: TokenRequest, authorization: str | None
) -> tuple[str, str | None]:
    if authorization is None:
        if body.client_id is None:
            raise OAuthError("invalid_request")
        return (
            body.client_id,
            body.client_secret.get_secret_value() if body.client_secret else None,
        )
    if body.client_secret is not None:
        raise OAuthError("invalid_request")
    scheme, _, encoded = authorization.partition(" ")
    try:
        if scheme.lower() != "basic":
            raise ValueError
        raw = b64decode(encoded, validate=True).decode("ascii")
        raw_id, colon, raw_secret = raw.partition(":")
        client_id, secret = unquote_plus(raw_id), unquote_plus(raw_secret)
        if (
            not colon
            or not 1 <= len(client_id) <= _MAX_CLIENT_FIELD_LENGTH
            or not 1 <= len(secret) <= _MAX_CLIENT_FIELD_LENGTH
            or (body.client_id is not None and body.client_id != client_id)
        ):
            raise ValueError
    except ValueError:
        raise InvalidClient from None
    return client_id, secret


async def _exchange(
    body: TokenRequest, db: Database, client_id: str, secret: str | None
) -> TokenPair:
    if secret is None:
        raise InvalidClient
    if body.code is None or body.redirect_uri is None or body.code_verifier is None:
        raise OAuthError("invalid_request")
    verifier = body.code_verifier.get_secret_value()
    if not all(c.isascii() and (c.isalnum() or c in "-._~") for c in verifier):
        raise OAuthError("invalid_request")
    return await exchange_code(
        db,
        client_id=client_id,
        client_secret=secret,
        code=body.code.get_secret_value(),
        redirect_uri=body.redirect_uri,
        code_verifier=verifier,
    )


async def _refresh(
    body: TokenRequest,
    db: Database,
    client_id: str,
    secret: str | None,
    dpop: str | None,
) -> TokenPair:
    if body.refresh_token is None:
        raise OAuthError("invalid_request")
    if dpop is None and secret is None:
        raise InvalidProof
    proof = (
        Proof.verify(dpop, f"{settings.public_url.rstrip('/')}/oauth/token")
        if dpop
        else None
    )
    return await renew_access(
        db,
        body.refresh_token.get_secret_value(),
        client_id=client_id,
        client_secret=secret,
        proof=proof,
    )


@router.post(
    "/token",
    summary="Trocar um código de autorização ou renovar o acesso OAuth",
    response_model_exclude_none=True,
    responses={
        400: {
            "model": OAuthProblem,
            "description": "Requisição, concessão ou prova DPoP inválida.",
        },
        401: {
            "model": OAuthProblem,
            "description": "Credenciais da aplicação inválidas.",
        },
        502: {"description": "SIGAA indisponível durante a renovação."},
    },
)
async def token(
    body: Annotated[TokenRequest, Form()],
    request: Request,
    db: DatabaseDep,
    queue: JobQueueDep,
    authorization: Annotated[str | None, Header(max_length=1024)] = None,
    dpop: Annotated[str | None, Header(max_length=MAX_PROOF_LENGTH)] = None,
) -> TokenResponse:
    form = await request.form()
    if any(len(form.getlist(name)) > 1 for name in TokenRequest.model_fields):
        raise OAuthError("invalid_request")
    if body.grant_type not in {"authorization_code", "refresh_token"}:
        raise OAuthError("unsupported_grant_type")
    try:
        client_id, secret = _client_credentials(body, authorization)
        if body.grant_type == "authorization_code":
            pair = await _exchange(body, db, client_id, secret)
        else:
            pair = await _refresh(body, db, client_id, secret, dpop)
            await schedule_account_sync(pair.credentials, db, queue)
    except InvalidClient:
        raise OAuthError("invalid_client", status=401) from None
    except InvalidProof:
        raise OAuthError("invalid_dpop_proof") from None
    except InvalidToken:
        raise OAuthError("invalid_grant") from None
    return TokenResponse(
        access_token=pair.access_token,
        refresh_token=pair.refresh_token
        if body.grant_type == "authorization_code"
        else None,
        expires_in=pair.expires_in,
        scope=" ".join(pair.scopes),
    )
