from collections.abc import Mapping

from fastapi import HTTPException, Request

from api.db.main import Database
from api.modules.oauth.scopes import insufficient_scope, route_scope
from api.modules.oauth.tokens import Access, InvalidToken, read_access


def parse_bearer_token(headers: Mapping[str, str]) -> str | None:
    raw = headers.get("authorization")
    if raw is None:
        return None
    scheme, _, token = raw.partition(" ")
    return token if scheme.lower() == "bearer" and token else None


def is_bearer_request(request: Request) -> bool:
    """Requisição de uma rota delegável autenticada por Bearer (e não por cookies)."""
    return "authorization" in request.headers and route_scope(request) is not None


async def authenticate_bearer(request: Request, db: Database) -> Access:
    token = parse_bearer_token(request.headers)
    if token is None:
        raise HTTPException(
            401, "Bearer token esperado.", headers={"WWW-Authenticate": "Bearer"}
        )
    try:
        access = await read_access(db, token)
    except InvalidToken:
        raise HTTPException(
            401,
            "Token inválido ou expirado.",
            headers={"WWW-Authenticate": 'Bearer error="invalid_token"'},
        ) from None
    required = route_scope(request)
    if required is None or required not in access.scopes:
        raise insufficient_scope()
    return access
