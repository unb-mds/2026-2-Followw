from typing import Annotated, Literal

from fastapi import APIRouter, Form, Header, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, SecretStr

from api.core.config import settings
from api.db.main import DatabaseDep
from api.modules.oauth.proof import InvalidProof, Proof
from api.modules.oauth.tokens import InvalidToken, renew_access

router = APIRouter()


class RefreshGrant(BaseModel):
    grant_type: Literal["refresh_token"]
    client_id: str = Field(min_length=1, max_length=256)
    refresh_token: SecretStr = Field(min_length=1, max_length=16384)


class TokenResponse(BaseModel):
    access_token: str = Field(repr=False)
    token_type: Literal["Bearer"] = "Bearer"
    expires_in: int
    scope: str


@router.post(
    "/token",
    response_model=TokenResponse,
    summary="Renovar o acesso OAuth de uma instalação com DPoP",
    responses={400: {"description": "Refresh ou prova DPoP inválidos."}},
)
async def refresh(
    body: Annotated[RefreshGrant, Form()],
    db: DatabaseDep,
    response: Response,
    dpop: Annotated[str | None, Header(max_length=8192)] = None,
):
    headers = {"Cache-Control": "no-store", "Pragma": "no-cache"}
    try:
        if dpop is None:
            raise InvalidProof("Prova DPoP ausente.")
        proof = Proof.verify(dpop, f"{settings.public_url.rstrip('/')}/oauth/token")
        pair = await renew_access(
            db,
            body.refresh_token.get_secret_value(),
            client_id=body.client_id,
            authenticated_client=False,
            proof=proof,
        )
    except InvalidProof:
        return JSONResponse(
            {"error": "invalid_dpop_proof"}, status_code=400, headers=headers
        )
    except InvalidToken:
        return JSONResponse(
            {"error": "invalid_grant"}, status_code=400, headers=headers
        )
    response.headers.update(headers)
    return TokenResponse(
        access_token=pair.access_token,
        expires_in=settings.access_token_expire_minutes * 60,
        scope=" ".join(pair.scopes),
    )
