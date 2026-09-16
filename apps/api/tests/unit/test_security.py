from datetime import UTC, datetime
import jwt
import pytest

from src.core.config import settings
from src.utils.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
)

def test_create_access_token():
    payload = {"sub": "12345"}
    token = create_access_token(payload)
    
    decoded = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    
    assert decoded["sub"] == "12345"
    assert "exp" in decoded
    
    # Check if expiration is correctly set in the future
    exp_time = datetime.fromtimestamp(decoded["exp"], tz=UTC)
    assert exp_time > datetime.now(UTC)

def test_create_refresh_token():
    payload = {"sub": "12345"}
    token = create_refresh_token(payload)
    
    decoded = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    
    assert decoded["sub"] == "12345"
    assert "exp" in decoded

def test_decode_token_success(valid_access_token):
    decoded = decode_token(valid_access_token)
    assert decoded["sub"] == "123456789"
    assert decoded["access_token"] == "sigaa_session_id"

def test_decode_token_expired(expired_access_token):
    with pytest.raises(jwt.ExpiredSignatureError):
        decode_token(expired_access_token)

def test_decode_token_invalid_signature():
    # Token assinado com outra chave
    token = jwt.encode({"sub": "12345"}, "wrong-secret-key", algorithm="HS256")
    with pytest.raises(jwt.InvalidTokenError):
        decode_token(token)

def test_decode_token_malformed():
    with pytest.raises(jwt.DecodeError):
        decode_token("not.a.valid.token")
