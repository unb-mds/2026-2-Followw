import os

# Define environment variables before importing anything from the app
os.environ["ENVIRONMENT"] = "testing"
os.environ["DATABASE_URL"] = (
    "postgresql+asyncpg://postgres:postgres@localhost:5432/test_db"
)
os.environ["JWT_SECRET_KEY"] = "super-secret-key-for-tests-12345"

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from src.main import app
from src.utils.security import (
    ACCESS_TOKEN_COOKIE_NAME,
    REFRESH_TOKEN_COOKIE_NAME,
    create_access_token,
    create_refresh_token,
)


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def valid_access_token():
    return create_access_token({"sub": "123456789", "access_token": "sigaa_session_id"})


@pytest.fixture
def valid_refresh_token():
    return create_refresh_token({"sub": "123456789", "registration": "123456789"})


@pytest.fixture
def expired_access_token():
    import jwt

    from src.core.config import settings

    # Criar um token expirado manualmente
    expire = datetime.now(UTC) - timedelta(minutes=10)
    payload = {"sub": "123456789", "access_token": "sigaa_session_id", "exp": expire}
    return jwt.encode(
        payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm
    )


@pytest.fixture
def auth_cookies(valid_access_token, valid_refresh_token):
    return {
        ACCESS_TOKEN_COOKIE_NAME: valid_access_token,
        REFRESH_TOKEN_COOKIE_NAME: valid_refresh_token,
    }
