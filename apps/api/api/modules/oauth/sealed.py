from datetime import datetime
from uuid import UUID

from joserfc.jwk import OctKey
from sigaa_client import Credentials

from api.core.config import settings
from api.crypto import decrypt_claims, derive_secret, encrypt_claims


def oauth_key(info: str, salt: bytes | None = None) -> OctKey:
    return OctKey.import_key(
        derive_secret(settings.oauth_secret_key, f"followw:oauth:{info}", salt)
    )


def seal(claims: dict, key: OctKey, *, record_id: UUID | None = None) -> str:
    """JWE dos claims; com `record_id`, prefixado pelo registro que guarda o salt."""
    token = encrypt_claims(claims, key)
    return token if record_id is None else f"{record_id}.{token}"


def split_sealed(token: str) -> tuple[UUID, str]:
    record_id, encrypted = token.split(".", 1)
    return UUID(record_id), encrypted


def unseal(token: str, key: OctKey, *, now: datetime) -> dict:
    """Claims do JWE; levanta `ValueError` se o `exp` já passou."""
    claims = decrypt_claims(token, key)
    if "exp" in claims and claims["exp"] <= now.timestamp():
        raise ValueError("Token expirado.")
    return claims


def login_claims(credentials: Credentials) -> dict:
    return {
        "registration": credentials.registration,
        "password": credentials.password.get_secret_value(),
    }
