from datetime import UTC, datetime, timedelta

import jwt
from fastapi import Request, Response
from pydantic import ValidationError
from sigaa_client import Credentials
from starlette.datastructures import Headers, MutableHeaders

from api.core.config import settings

ACCESS_COOKIE_NAME = "access_token"
REFRESH_COOKIE_NAME = "refresh_token"


def set_access_cookie(response: Response, session_token: str) -> None:
    _set_cookie(
        response,
        ACCESS_COOKIE_NAME,
        {"session_token": session_token},
        settings.access_token_expire_minutes,
    )


def read_access_cookie(request: Request) -> str | None:
    payload = _read_cookie(request, ACCESS_COOKIE_NAME)

    return payload.get("session_token") if payload else None


def set_refresh_cookie(response: Response, credentials: Credentials) -> None:
    _set_cookie(
        response,
        REFRESH_COOKIE_NAME,
        {
            "registration": credentials.registration,
            "password": credentials.password.get_secret_value(),
        },
        settings.refresh_token_expire_minutes,
    )


def read_refresh_cookie(request: Request) -> Credentials | None:
    payload = _read_cookie(request, REFRESH_COOKIE_NAME)
    try:
        return Credentials.model_validate(payload) if payload else None
    except ValidationError:
        return None


def clear_cookies(response: Response) -> None:
    response.delete_cookie(ACCESS_COOKIE_NAME)
    response.delete_cookie(REFRESH_COOKIE_NAME)


def clear_cookies_headers() -> Headers:
    """`Set-Cookie` que apagam a sessão, para o `headers` de uma `HTTPException`."""
    response = Response()
    clear_cookies(response)
    # `Headers.items()` repete a chave, então os dois `Set-Cookie` sobrevivem.
    return MutableHeaders(
        raw=[header for header in response.raw_headers if header[0] == b"set-cookie"]
    )


def _set_cookie(
    response: Response, name: str, payload: dict, expire_minutes: int
) -> None:
    expires = datetime.now(UTC) + timedelta(minutes=expire_minutes)
    token = jwt.encode(
        {**payload, "exp": expires},
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )
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
    if token is None:
        return None

    try:
        return jwt.decode(
            token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
        )
    except jwt.InvalidTokenError:
        return None
