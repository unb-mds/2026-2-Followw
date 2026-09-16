import pytest
from fastapi import HTTPException, Request

from src.core.dependencies import get_current_user
from src.utils.security import ACCESS_TOKEN_COOKIE_NAME

def test_get_current_user_with_valid_cookie(valid_access_token):
    # Simula um Request do FastAPI que tem o cookie setado
    request = Request(scope={"type": "http", "headers": []})
    request._cookies = {ACCESS_TOKEN_COOKIE_NAME: valid_access_token}
    
    user = get_current_user(request)
    assert user["sub"] == "123456789"
    assert user["access_token"] == "sigaa_session_id"

def test_get_current_user_missing_cookie():
    request = Request(scope={"type": "http", "headers": []})
    request._cookies = {}
    
    with pytest.raises(HTTPException) as excinfo:
        get_current_user(request)
        
    assert excinfo.value.status_code == 401
    assert excinfo.value.detail == "Not authenticated"

def test_get_current_user_expired_token(expired_access_token):
    request = Request(scope={"type": "http", "headers": []})
    request._cookies = {ACCESS_TOKEN_COOKIE_NAME: expired_access_token}
    
    with pytest.raises(HTTPException) as excinfo:
        get_current_user(request)
        
    assert excinfo.value.status_code == 401
    assert excinfo.value.detail == "Token expired"

def test_get_current_user_invalid_token():
    request = Request(scope={"type": "http", "headers": []})
    request._cookies = {ACCESS_TOKEN_COOKIE_NAME: "invalid-token-string"}
    
    with pytest.raises(HTTPException) as excinfo:
        get_current_user(request)
        
    assert excinfo.value.status_code == 401
    assert excinfo.value.detail == "Invalid token"
