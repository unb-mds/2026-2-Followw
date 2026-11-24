from base64 import urlsafe_b64encode
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from hmac import compare_digest
from urllib.parse import urlencode

from joserfc.errors import JoseError
from joserfc.jwk import OctKey
from pydantic import BaseModel
from sigaa_client import Credentials
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from api.core.config import settings
from api.crypto import decrypt_claims, derive_secret, encrypt_claims
from api.db.main import Database
from api.db.models import OAuthApplication, OAuthAuthorizationCode
from api.modules.oauth.applications import (
    ApplicationRepository,
    InvalidClient,
    parse_client_id,
)
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


def _key(purpose: str) -> OctKey:
    return OctKey.import_key(
        derive_secret(settings.oauth_secret_key, f"followw:oauth:{purpose}")
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
) -> OAuthApplication:
    try:
        client_id = parse_client_id(consent.client_id)
    except InvalidClient:
        raise OAuthError("invalid_client") from None
    application = await ApplicationRepository(session).get(client_id, lock=lock)
    if application is None:
        raise OAuthError("invalid_client")
    if consent.redirect_uri not in application.redirect_uris:
        raise OAuthError("invalid_request")
    return application


def _digest(value: str) -> str:
    return sha256(value.encode()).hexdigest()


async def prepare_consent(
    db: Database, consent: Consent, cookie: str
) -> tuple[OAuthApplication, str]:
    application = await db.read(lambda session: _load_application(session, consent))
    token = _seal(
        "consent",
        {**consent.model_dump(mode="json"), "session": _digest(cookie)},
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
    cookie: str,
    credentials: Credentials,
    *,
    approved: bool,
) -> str:
    try:
        claims = _open("consent", token)
        if not compare_digest(claims["session"], _digest(cookie)):
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
        code = _seal(
            "code",
            {
                **consent.model_dump(mode="json", exclude={"state", "redirect_uri"}),
                "redirect_digest": _digest(consent.redirect_uri),
                "registration": credentials.registration,
                "password": credentials.password.get_secret_value(),
            },
            expires_at,
        )
        await session.execute(
            delete(OAuthAuthorizationCode).where(
                OAuthAuthorizationCode.expires_at <= now
            )
        )
        session.add(
            OAuthAuthorizationCode(
                digest=sha256(code.encode()).digest(), expires_at=expires_at
            )
        )
        return _redirect(consent, code=code)

    return await db.write(issue)


async def exchange_code(
    db: Database,
    *,
    client_id: str,
    client_secret: str,
    code: str,
    redirect_uri: str,
    code_verifier: str,
) -> TokenPair:
    async def exchange(session: AsyncSession) -> TokenPair:
        app = await ApplicationRepository(session).authenticate(
            client_id, client_secret, lock=True
        )
        try:
            claims = _open("code", code)
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
        # O DELETE condicional e a criação da concessão são confirmados juntos.
        consumed = await session.scalar(
            delete(OAuthAuthorizationCode)
            .where(
                OAuthAuthorizationCode.digest == sha256(code.encode()).digest(),
                OAuthAuthorizationCode.expires_at > datetime.now(UTC),
            )
            .returning(OAuthAuthorizationCode.digest)
        )
        if consumed is None:
            raise InvalidToken
        return await create_token_pair(
            session,
            client_id=client_id,
            credentials=credentials,
            accepted=scopes,
            authenticated_client=True,
        )

    return await db.write(exchange)
