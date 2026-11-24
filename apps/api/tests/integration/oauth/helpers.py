from base64 import urlsafe_b64encode
from hashlib import sha256
from urllib.parse import parse_qs, urlsplit

APPLICATIONS = "/oauth/applications"
AUTHORIZE = "/oauth/authorize"
TOKEN = "/oauth/token"
REDIRECT = "https://app.example/callback?return=agenda"
VERIFIER = "a" * 43
CHALLENGE = urlsafe_b64encode(sha256(VERIFIER.encode()).digest()).decode().rstrip("=")


def authorization_query(app):
    return {
        "client_id": app["client_id"],
        "response_type": "code",
        "redirect_uri": REDIRECT,
        "scope": "classrooms:read classrooms.frequency:read",
        "state": "da aplicação & = +",
        "code_challenge": CHALLENGE,
        "code_challenge_method": "S256",
    }


def approve(client, user, app):
    response = client.get(AUTHORIZE, params=authorization_query(app), headers=user)
    assert response.status_code == 200, response.json()
    response = client.post(
        AUTHORIZE,
        json={"request_token": response.json()["request_token"], "approved": True},
        headers=user,
    )
    assert response.status_code == 200, response.json()
    params = parse_qs(urlsplit(response.json()["redirect_uri"]).query)
    return params["code"][0]


def exchange_form(code):
    return {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": REDIRECT,
        "code_verifier": VERIFIER,
    }
