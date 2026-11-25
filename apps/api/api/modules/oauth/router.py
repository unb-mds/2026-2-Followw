import base64
import binascii
import re
from typing import Annotated, Literal
from urllib.parse import unquote_plus

from fastapi import APIRouter, Form, Header, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, SecretStr, field_validator

from api.core.config import settings
from api.db.main import DatabaseDep
from api.modules.auth.account import schedule_account_sync
from api.modules.oauth.authorization import exchange_code
from api.modules.oauth.clients import (
    InvalidClient,
)
from api.modules.oauth.proof import MAX_PROOF_LENGTH, InvalidProof, Proof
from api.modules.oauth.protocol import OAuthError, ProtocolRoute
from api.modules.oauth.tokens import (
    MAX_TOKEN_LENGTH,
    InvalidToken,
    renew_access,
)
from api.sync.queue import JobQueueDep

router = APIRouter(route_class=ProtocolRoute)


class TokenGrant(BaseModel):
    grant_type: Literal["refresh_token", "authorization_code"]
    client_id: str | None = Field(default=None, min_length=1, max_length=256)
    client_secret: SecretStr | None = Field(default=None, min_length=1, max_length=256)
    refresh_token: SecretStr | None = Field(
        default=None, min_length=1, max_length=MAX_TOKEN_LENGTH
    )
    code: SecretStr | None = Field(
        default=None, min_length=1, max_length=MAX_TOKEN_LENGTH
    )
    redirect_uri: str | None = Field(default=None, max_length=2048)
    code_verifier: SecretStr | None = Field(default=None, min_length=43, max_length=128)

    @field_validator("code_verifier")
    @classmethod
    def validate_verifier(cls, value: SecretStr | None) -> SecretStr | None:
        if value is not None and not re.fullmatch(
            r"[A-Za-z0-9._~-]+", value.get_secret_value()
        ):
            raise ValueError("Code verifier inválido.")
        return value


class TokenResponse(BaseModel):
    access_token: str = Field(repr=False)
    token_type: Literal["Bearer"] = "Bearer"
    expires_in: int
    scope: str
    refresh_token: str | None = Field(default=None, repr=False)


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
    body: TokenGrant, authorization: str | None
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
    response_model_exclude_none=True,
    summary="Trocar um código ou renovar o acesso OAuth",
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
async def token(
    body: Annotated[TokenGrant, Form()],
    db: DatabaseDep,
    queue: JobQueueDep,
    response: Response,
    request: Request,
    dpop: Annotated[str | None, Header(max_length=MAX_PROOF_LENGTH)] = None,
    authorization: Annotated[str | None, Header(max_length=1024)] = None,
):
    headers = {"Cache-Control": "no-store", "Pragma": "no-cache"}
    try:
        client_id, client_secret = _client_credentials(body, authorization)
        proof = (
            Proof.verify(dpop, f"{settings.public_url.rstrip('/')}/oauth/token")
            if dpop is not None
            else None
        )
        form = await request.form()
        if any(len(form.getlist(name)) > 1 for name in TokenGrant.model_fields):
            raise OAuthError("invalid_request")
        if body.grant_type == "authorization_code":
            if (
                body.code is None
                or body.redirect_uri is None
                or body.code_verifier is None
            ):
                raise OAuthError("invalid_request")
            pair = await exchange_code(
                db,
                client_id=client_id,
                client_secret=client_secret,
                code=body.code.get_secret_value(),
                redirect_uri=body.redirect_uri,
                code_verifier=body.code_verifier.get_secret_value(),
                proof=proof,
            )
        else:
            if body.refresh_token is None:
                raise OAuthError("invalid_request")
            pair = await renew_access(
                db,
                body.refresh_token.get_secret_value(),
                client_id=client_id,
                client_secret=client_secret,
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
    if body.grant_type == "refresh_token":
        await schedule_account_sync(pair.credentials, db, queue)
    response.headers.update(headers)
    return TokenResponse(
        access_token=pair.access_token,
        expires_in=pair.expires_in,
        scope=" ".join(pair.scopes),
        refresh_token=pair.refresh_token
        if body.grant_type == "authorization_code"
        else None,
    )
