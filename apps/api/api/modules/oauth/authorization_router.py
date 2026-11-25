from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field, SecretStr

from api.cookies import WebSession, read_refresh_cookie
from api.db.main import DatabaseDep
from api.modules.oauth.authorization import Consent, decide_consent, prepare_consent
from api.modules.oauth.clients import MAX_URI_LENGTH
from api.modules.oauth.protocol import (
    PRIVATE_HEADERS,
    OAuthError,
    OAuthProblem,
    ProtocolRoute,
)
from api.modules.oauth.scopes import PERMISSIONS, Scope, granted_scopes
from api.modules.oauth.tokens import MAX_TOKEN_LENGTH

router = APIRouter(route_class=ProtocolRoute)


async def web_session(request: Request) -> WebSession:
    session = read_refresh_cookie(request)
    if session is None or "authorization" in request.headers:
        raise HTTPException(401, "Sessão web necessária.", headers=PRIVATE_HEADERS)
    return session


WebSessionDep = Annotated[WebSession, Depends(web_session)]


class AuthorizationRequest(BaseModel):
    response_type: Literal["code"]
    client_id: str = Field(min_length=1, max_length=128)
    redirect_uri: str = Field(min_length=1, max_length=MAX_URI_LENGTH)
    scope: str = Field(default="", max_length=512)
    state: str | None = Field(default=None, min_length=1, max_length=512)
    code_challenge: str = Field(pattern=r"^[A-Za-z0-9_-]{43}$")
    code_challenge_method: Literal["S256"]


class PermissionResponse(BaseModel):
    scope: Scope
    label: str
    trust_level: Literal["low", "medium", "high"]
    requires: Scope | None = None


class AuthorizationDetails(BaseModel):
    client_id: str
    name: str
    permissions: list[PermissionResponse]
    request_token: str = Field(repr=False)


class AuthorizationDecision(BaseModel):
    request_token: SecretStr = Field(min_length=1, max_length=MAX_TOKEN_LENGTH)
    approved: bool


class AuthorizationRedirect(BaseModel):
    redirect_uri: str


@router.get(
    "/authorize",
    summary="Consultar a aplicação e as permissões solicitadas",
    responses={
        400: {
            "model": OAuthProblem,
            "description": "Aplicação, URI ou escopos inválidos.",
        }
    },
)
async def get_authorization(
    params: Annotated[AuthorizationRequest, Query()],
    request: Request,
    session: WebSessionDep,
    db: DatabaseDep,
) -> AuthorizationDetails:
    if any(
        len(request.query_params.getlist(name)) > 1
        for name in AuthorizationRequest.model_fields
    ):
        raise OAuthError("invalid_request")
    try:
        scopes = granted_scopes([Scope.PROFILE, *params.scope.split()])
    except ValueError:
        raise OAuthError("invalid_scope") from None
    consent = Consent(
        client_id=params.client_id,
        redirect_uri=params.redirect_uri,
        scopes=scopes,
        state=params.state,
        code_challenge=params.code_challenge,
    )
    app, token = await prepare_consent(db, consent, session.session_id)
    return AuthorizationDetails(
        client_id=consent.client_id,
        name=app.name,
        permissions=[
            PermissionResponse(scope=scope, **PERMISSIONS[scope]) for scope in scopes
        ],
        request_token=token,
    )


@router.post(
    "/authorize",
    summary="Aprovar ou recusar a autorização OAuth",
    responses={
        400: {
            "model": OAuthProblem,
            "description": "Pedido de autorização inválido ou expirado.",
        }
    },
)
async def post_authorization(
    body: AuthorizationDecision,
    request: Request,
    session: WebSessionDep,
    db: DatabaseDep,
) -> AuthorizationRedirect:
    redirect_uri = await decide_consent(
        db,
        body.request_token.get_secret_value(),
        session.session_id,
        session.credentials,
        approved=body.approved,
    )
    return AuthorizationRedirect(redirect_uri=redirect_uri)
