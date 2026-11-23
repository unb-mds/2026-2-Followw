from functools import cache

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from joserfc import jwt
from joserfc.jwe import JWERegistry
from joserfc.jwk import OctKey

from api.core.config import settings

# JWE com chave simétrica direta: AES-GCM cifra e autentica o payload.
_JWE_HEADER = {"alg": "dir", "enc": "A256GCM"}
_JWE_REGISTRY = JWERegistry(algorithms=list(_JWE_HEADER.values()))


def encrypt_claims(claims: dict, key: OctKey) -> str:
    return jwt.encode(_JWE_HEADER, claims, key, registry=_JWE_REGISTRY)


def decrypt_claims(token: str, key: OctKey) -> dict:
    return jwt.decode(token, key, registry=_JWE_REGISTRY).claims


def derive_key(info: str) -> bytes:
    """Chave de 256 bits derivada do `jwt_secret_key`, uma para cada `info`."""
    return _hkdf(settings.jwt_secret_key, info)


@cache
def _hkdf(secret: str, info: str) -> bytes:
    return derive_secret(secret, info, salt=None)


def derive_secret(secret: str, info: str, salt: bytes | None = None) -> bytes:
    return HKDF(
        algorithm=hashes.SHA256(), length=32, salt=salt, info=info.encode()
    ).derive(secret.encode())
