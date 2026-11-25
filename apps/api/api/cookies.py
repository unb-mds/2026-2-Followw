from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi import Request, Response
from joserfc import jwt
from joserfc.errors import JoseError
from joserfc.jwk import OctKey
from pydantic import BaseModel, ValidationError
from sigaa_client import Credentials

from api.core.config import settings
from api.crypto import decrypt_claims, derive_key, encrypt_claims

ACCESS_COOKIE_NAME = "access_token"
REFRESH_COOKIE_NAME = "refresh_token"

_CLAIMS = jwt.JWTClaimsRegistry(exp={"essential": True})


def set_access_cookie(
    response: Response, session_token: str, registration: str
) -> None:
    """`registration` é o login que abriu a sessão, não a do perfil."""
    _set_cookie(
        response,
        ACCESS_COOKIE_NAME,
        {"session_token": session_token, "registration": registration},
        settings.access_token_expire_minutes,
    )


def read_access_cookie(request: Request, registration: str) -> str | None:
    """Token da sessão, só se ela foi aberta pelo mesmo login do refresh_token."""
    payload = _read_cookie(request, ACCESS_COOKIE_NAME)
    if not payload or payload.get("registration") != registration:
        return None
    return payload.get("session_token")


class WebSession(BaseModel):
    credentials: Credentials
    session_id: str


def set_refresh_cookie(
    response: Response, credentials: Credentials, session_id: str | None = None
) -> None:
    _set_cookie(
        response,
        REFRESH_COOKIE_NAME,
        {
            "registration": credentials.registration,
            "password": credentials.password.get_secret_value(),
            "session_id": session_id or str(uuid4()),
        },
        settings.refresh_token_expire_minutes,
    )


def read_refresh_cookie(request: Request) -> WebSession | None:
    payload = _read_cookie(request, REFRESH_COOKIE_NAME)
    try:
        return (
            WebSession(
                credentials=Credentials.model_validate(payload),
                session_id=payload.get("session_id"),
            )
            if payload
            else None
        )
    except ValidationError:
        return None


def clear_cookies(response: Response) -> None:
    for name in (ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME):
        response.delete_cookie(name)


def encrypt_cookie(name: str, claims: dict) -> str:
    if not isinstance(claims.get("exp"), int):
        raise TypeError("claims precisam de um `exp` inteiro")
    return encrypt_claims(claims, _key(name))


def decrypt_cookie(name: str, token: str) -> dict | None:
    """Claims do cookie, ou `None` se ele não foi cifrado por nós ou expirou."""
    try:
        claims = decrypt_claims(token, _key(name))
        _CLAIMS.validate(claims)
    except JoseError, ValueError, TypeError:
        return None
    return claims


def _key(name: str) -> OctKey:
    return OctKey.import_key(derive_key(f"followw:cookie:{name}"))


def _set_cookie(
    response: Response, name: str, payload: dict, expire_minutes: int
) -> None:
    expires = datetime.now(UTC) + timedelta(minutes=expire_minutes)
    token = encrypt_cookie(name, {**payload, "exp": int(expires.timestamp())})
    # Gravar de novo na mesma resposta substitui o cookie em vez de repeti-lo.
    prefix = f"{name}=".encode("latin-1")
    response.raw_headers[:] = [
        (key, value)
        for key, value in response.raw_headers
        if not (key == b"set-cookie" and value.startswith(prefix))
    ]
    response.set_cookie(
        key=name,
        value=token,
        httponly=True,
        # Em desenvolvimento a API roda em HTTP puro, e o navegador descarta
        # cookies `Secure`.
        secure=settings.environment == "production",
        samesite="lax",
        max_age=expire_minutes * 60,
    )


def _read_cookie(request: Request, name: str) -> dict | None:
    token = request.cookies.get(name)
    return decrypt_cookie(name, token) if token is not None else None
