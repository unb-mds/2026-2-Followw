from datetime import UTC, datetime, timedelta
from functools import cache

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from fastapi import Request, Response
from joserfc import jwt
from joserfc.errors import JoseError
from joserfc.jwe import JWERegistry
from joserfc.jwk import OctKey
from pydantic import ValidationError
from sigaa_client import Credentials

from api.core.config import settings

ACCESS_COOKIE_NAME = "access_token"
REFRESH_COOKIE_NAME = "refresh_token"

# Cliente nativo: sem cookies, os mesmos JWE trafegam nestes headers.
MODE_HEADER = "X-Followw-Auth"
ACCESS_HEADER = "X-Followw-Access"
REFRESH_HEADER = "X-Followw-Refresh"
_HEADERS = {ACCESS_COOKIE_NAME: ACCESS_HEADER, REFRESH_COOKIE_NAME: REFRESH_HEADER}

# JWE com chave simétrica direta: AES-GCM cifra e autentica o payload.
_JWE_HEADER = {"alg": "dir", "enc": "A256GCM"}
_JWE_REGISTRY = JWERegistry(algorithms=list(_JWE_HEADER.values()))
_CLAIMS = jwt.JWTClaimsRegistry(exp={"essential": True})


def is_native(request: Request) -> bool:
    return request.headers.get(MODE_HEADER) == "header"


def set_access_cookie(
    response: Response, session_token: str, registration: str, *, native: bool = False
) -> None:
    """`registration` é o login que abriu a sessão, não a do perfil."""
    _set_cookie(
        response,
        ACCESS_COOKIE_NAME,
        {"session_token": session_token, "registration": registration},
        settings.access_token_expire_minutes,
        native,
    )


def read_access_cookie(request: Request, registration: str) -> str | None:
    """Token da sessão, só se ela foi aberta pelo mesmo login do refresh_token."""
    payload = _read_cookie(request, ACCESS_COOKIE_NAME)
    if not payload or payload.get("registration") != registration:
        return None
    return payload.get("session_token")


def set_refresh_cookie(
    response: Response, credentials: Credentials, *, native: bool = False
) -> None:
    _set_cookie(
        response,
        REFRESH_COOKIE_NAME,
        {
            "registration": credentials.registration,
            "password": credentials.password.get_secret_value(),
        },
        settings.refresh_token_expire_minutes,
        native,
    )


def read_refresh_cookie(request: Request) -> Credentials | None:
    payload = _read_cookie(request, REFRESH_COOKIE_NAME)
    try:
        return Credentials.model_validate(payload) if payload else None
    except ValidationError:
        return None


def clear_cookies(response: Response, *, native: bool = False) -> None:
    # No modo nativo o servidor não guarda nada: o cliente descarta os tokens.
    if native:
        return
    for name in (ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME):
        response.delete_cookie(name)


def encrypt_cookie(name: str, claims: dict) -> str:
    if not isinstance(claims.get("exp"), int):
        raise TypeError("claims precisam de um `exp` inteiro")
    return jwt.encode(_JWE_HEADER, claims, _key(name), registry=_JWE_REGISTRY)


def decrypt_cookie(name: str, token: str) -> dict | None:
    """Claims do cookie, ou `None` se ele não foi cifrado por nós ou expirou."""
    try:
        claims = jwt.decode(token, _key(name), registry=_JWE_REGISTRY).claims
        _CLAIMS.validate(claims)
    except JoseError, ValueError, TypeError:
        return None
    return claims


def _key(name: str) -> OctKey:
    return OctKey.import_key(derive_key(f"followw:cookie:{name}"))


def derive_key(info: str) -> bytes:
    """Chave de 256 bits derivada do `jwt_secret_key`, uma para cada `info`."""
    return _hkdf(settings.jwt_secret_key, info)


@cache
def _hkdf(secret: str, info: str) -> bytes:
    return HKDF(
        algorithm=hashes.SHA256(), length=32, salt=None, info=info.encode()
    ).derive(secret.encode())


def _set_cookie(
    response: Response,
    name: str,
    payload: dict,
    expire_minutes: int,
    native: bool = False,
) -> None:
    expires = datetime.now(UTC) + timedelta(minutes=expire_minutes)
    token = encrypt_cookie(name, {**payload, "exp": int(expires.timestamp())})
    if native:
        response.headers[_HEADERS[name]] = token
        return
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
    if is_native(request):
        token = request.headers.get(_HEADERS[name])
    else:
        token = request.cookies.get(name)
    return decrypt_cookie(name, token) if token is not None else None
