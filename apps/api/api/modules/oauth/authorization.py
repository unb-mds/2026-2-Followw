import secrets
from base64 import urlsafe_b64encode
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from hmac import compare_digest
from urllib.parse import urlencode
from uuid import UUID, uuid4

from joserfc.errors import JoseError
from joserfc.jwk import OctKey
from pydantic import BaseModel
from sigaa_client import Credentials
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.core.config import settings
from api.crypto import decrypt_claims, derive_secret, encrypt_claims
from api.db.main import Database
from api.db.models import OAuthAuthorizationCode, OAuthClient
from api.modules.oauth.clients import authenticate_client
from api.modules.oauth.proof import Proof
from api.modules.oauth.protocol import OAuthError
from api.modules.oauth.scopes import Scope, granted_scopes
from api.modules.oauth.tokens import InvalidToken, TokenPair, create_token_pair

_CONSENT_TTL = timedelta(minutes=10)
_CODE_TTL = timedelta(minutes=5)


class Consent(BaseModel):
    client_id: str
    redirect_uri: str
    scopes: list[Scope]
    code_challenge: str
    state: str | None


def _key(purpose: str, salt: bytes = b"") -> OctKey:
    return OctKey.import_key(
        derive_secret(settings.oauth_secret_key, f"followw:oauth:{purpose}", salt)
    )


def _seal(purpose: str, claims: dict, expires_at: datetime) -> str:
    return encrypt_claims({**claims, "exp": int(expires_at.timestamp())}, _key(purpose))


def _open(purpose: str, token: str) -> dict:
    claims = decrypt_claims(token, _key(purpose))
    if claims["exp"] <= datetime.now(UTC).timestamp():
        raise ValueError("Autorização expirada.")
    return claims


async def _load_application(
    session: AsyncSession, consent: Consent, *, lock: bool = False
) -> OAuthClient:
    query = select(OAuthClient).where(OAuthClient.client_id == consent.client_id)
    application = await session.scalar(query.with_for_update() if lock else query)
    if application is None:
        raise OAuthError("invalid_client")
    if consent.redirect_uri not in application.redirect_uris:
        raise OAuthError("invalid_request")
    return application


def _digest(value: str) -> str:
    return sha256(value.encode()).hexdigest()


async def prepare_consent(
    db: Database, consent: Consent, session_id: str
) -> tuple[OAuthClient, str]:
    application = await db.read(lambda session: _load_application(session, consent))
    token = _seal(
        "consent",
        {**consent.model_dump(mode="json"), "session": _digest(session_id)},
        datetime.now(UTC) + _CONSENT_TTL,
    )
    return application, token


def _redirect(consent: Consent, **params: str) -> str:
    if consent.state is not None:
        params["state"] = consent.state
    separator = "&" if "?" in consent.redirect_uri else "?"
    return f"{consent.redirect_uri}{separator}{urlencode(params)}"


async def decide_consent(
    db: Database,
    token: str,
    session_id: str,
    credentials: Credentials,
    *,
    approved: bool,
) -> str:
    try:
        claims = _open("consent", token)
        if not compare_digest(claims["session"], _digest(session_id)):
            raise ValueError
        consent = Consent.model_validate(claims)
        granted_scopes(consent.scopes)
    except JoseError, KeyError, TypeError, ValueError:
        raise OAuthError("invalid_request") from None

    if not approved:
        await db.read(lambda session: _load_application(session, consent))
        return _redirect(consent, error="access_denied")

    async def issue(session: AsyncSession) -> str:
        await _load_application(session, consent, lock=True)
        now = datetime.now(UTC)
        expires_at = now + _CODE_TTL
        record = OAuthAuthorizationCode(
            id=uuid4(), salt=secrets.token_bytes(32), expires_at=expires_at
        )
        code = f"{record.id}." + encrypt_claims(
            {
                **consent.model_dump(mode="json", exclude={"state", "redirect_uri"}),
                "redirect_digest": _digest(consent.redirect_uri),
                "registration": credentials.registration,
                "password": credentials.password.get_secret_value(),
            },
            _key(f"code:{record.id}", record.salt),
        )
        await session.execute(
            delete(OAuthAuthorizationCode).where(
                OAuthAuthorizationCode.expires_at <= now
            )
        )
        session.add(record)
        return _redirect(consent, code=code)

    return await db.write(issue)


async def exchange_code(
    db: Database,
    *,
    client_id: str,
    client_secret: str | None,
    code: str,
    redirect_uri: str,
    code_verifier: str,
    proof: Proof | None = None,
) -> TokenPair:
    async def exchange(session: AsyncSession) -> TokenPair:
        app = await authenticate_client(session, client_id, client_secret, proof=proof)
        try:
            record_id, encrypted = code.split(".", 1)
            record = await session.get(
                OAuthAuthorizationCode, UUID(record_id), with_for_update=True
            )
            if record is None or record.expires_at <= datetime.now(UTC):
                raise ValueError
            claims = decrypt_claims(encrypted, _key(f"code:{record.id}", record.salt))
            challenge = (
                urlsafe_b64encode(sha256(code_verifier.encode()).digest())
                .decode()
                .rstrip("=")
            )
            if (
                claims["client_id"] != client_id
                or not compare_digest(claims["redirect_digest"], _digest(redirect_uri))
                or redirect_uri not in app.redirect_uris
                or not compare_digest(claims["code_challenge"], challenge)
            ):
                raise ValueError
            credentials = Credentials.model_validate(claims)
            scopes = granted_scopes(claims["scopes"])
        except JoseError, KeyError, TypeError, ValueError:
            raise InvalidToken from None
        await session.delete(record)
        return await create_token_pair(
            session,
            client_id=client_id,
            credentials=credentials,
            accepted=scopes,
            authenticated_client=app.confidential,
            proof=proof,
        )

    return await db.write(exchange)
