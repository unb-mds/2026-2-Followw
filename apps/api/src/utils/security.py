from datetime import UTC, datetime, timedelta

import jwt

from src.core.config import settings

ACCESS_TOKEN_COOKIE_NAME = "access_token"
REFRESH_TOKEN_COOKIE_NAME = "refresh_token"


def _create_token(data: dict, expire_minutes: int) -> str:
    expire = datetime.now(UTC) + timedelta(minutes=expire_minutes)
    payload = {**data, "exp": expire}
    return jwt.encode(
        payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm
    )


def create_access_token(data: dict) -> str:
    return _create_token(data, settings.access_token_expire_minutes)


def create_refresh_token(data: dict) -> str:
    return _create_token(data, settings.refresh_token_expire_minutes)


def decode_token(token: str) -> dict:
    return jwt.decode(
        token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
    )
