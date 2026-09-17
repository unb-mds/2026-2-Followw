from unittest.mock import AsyncMock, patch

from fastapi import APIRouter
from sigaa_client import AuthenticationFailed, SigaaError

from src.core.dependencies import CurrentUser
from src.main import app

# Rota de teste para validar a injeção da dependência
test_router = APIRouter()


@test_router.get("/protected-route")
def protected_route(user: CurrentUser):
    return {"user": user}


app.include_router(test_router)


def test_login_payload_validation_error(client):
    # Faltando senha
    response = client.post("/auth/sigaa", json={"registration": "190012345"})
    assert response.status_code == 422

    # Payload vazio
    response = client.post("/auth/sigaa", json={})
    assert response.status_code == 422


@patch("src.modules.auth.main.SigaaClient")
def test_login_invalid_credentials(mock_sigaa_client_class, client):
    # O mock do context manager precisa simular a exceção AuthenticationFailed
    mock_client_instance = AsyncMock()
    mock_client_instance.authenticate.side_effect = AuthenticationFailed("Invalid")

    mock_sigaa_client_class.return_value.__aenter__.return_value = mock_client_instance

    response = client.post(
        "/auth/sigaa", json={"registration": "190012345", "password": "wrong"}
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid credentials"


@patch("src.modules.auth.main.SigaaClient")
def test_login_sigaa_error(mock_sigaa_client_class, client):
    mock_client_instance = AsyncMock()
    mock_client_instance.authenticate.side_effect = SigaaError("Internal Server Error")

    mock_sigaa_client_class.return_value.__aenter__.return_value = mock_client_instance

    response = client.post(
        "/auth/sigaa", json={"registration": "190012345", "password": "wrong"}
    )
    assert response.status_code == 502
    assert response.json()["detail"] == "Internal Server Error"


@patch("src.modules.auth.main.SigaaClient")
def test_login_success_sets_cookies(mock_sigaa_client_class, client):
    mock_client_instance = AsyncMock()
    mock_client_instance.authenticate.return_value = "mocked_session_id_123"

    mock_sigaa_client_class.return_value.__aenter__.return_value = mock_client_instance

    response = client.post(
        "/auth/sigaa",
        json={"registration": "190012345", "password": "correct_password"},
    )

    assert response.status_code == 200
    assert response.json() == {"message": "Login successful"}

    # Verificar a presença e atributos dos cookies no header de resposta
    set_cookie_headers = response.headers.get_list("set-cookie")
    assert len(set_cookie_headers) == 2

    # Verifica a existência dos cookies access_token e refresh_token
    cookie_str = "".join(set_cookie_headers)
    assert "access_token=" in cookie_str
    assert "refresh_token=" in cookie_str
    assert "HttpOnly" in cookie_str
    assert "Secure" in cookie_str
    assert "SameSite=lax" in cookie_str


def test_protected_endpoint_access_flow(client, auth_cookies):
    # Tenta acessar sem cookies
    response = client.get("/protected-route")
    assert response.status_code == 401
    assert response.json()["detail"] == "Not authenticated"

    # Tenta acessar com cookies inválidos
    response = client.get("/protected-route", cookies={"access_token": "invalid"})
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid token"

    # Tenta acessar com cookies válidos injetados pela fixture
    client.cookies.update(auth_cookies)
    response = client.get("/protected-route")
    assert response.status_code == 200
    assert response.json()["user"]["sub"] == "123456789"
    assert response.json()["user"]["access_token"] == "sigaa_session_id"
