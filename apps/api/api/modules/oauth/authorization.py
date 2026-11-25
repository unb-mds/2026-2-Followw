import secrets
from base64 import urlsafe_b64encode
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from hmac import compare_digest
from urllib.parse import urlencode
from uuid import uuid4

from joserfc.errors import JoseError
from joserfc.jwk import OctKey
from pydantic import BaseModel
from sigaa_client import Credentials
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.main import Database
from api.db.models import OAuthAuthorizationCode, OAuthClient
from api.modules.oauth.clients import authenticate_client
from api.modules.oauth.proof import Proof
from api.modules.oauth.protocol import OAuthError
from api.modules.oauth.scopes import Scope, granted_scopes
from api.modules.oauth.sealed import (
    login_claims,
    oauth_key,
    seal,
    split_sealed,
    unseal,
)
from api.modules.oauth.tokens import InvalidToken, TokenPair, create_token_pair

_CONSENT_TTL = timedelta(minutes=10)
_CODE_TTL = timedelta(minutes=5)
_CONSENT_KEY = oauth_key("consent")


class Consent(BaseModel):
    client_id: str
    redirect_uri: str
    scopes: list[Scope]
    code_challenge: str
    state: str | None


def _digest(value: str) -> str:
    return sha256(value.encode()).hexdigest()


def _s256(verifier: str) -> str:
    return urlsafe_b64encode(sha256(verifier.encode()).digest()).decode().rstrip("=")


def _code_key(record: OAuthAuthorizationCode) -> OctKey:
    return oauth_key(f"code:{record.id}", record.salt)


async def _load_application(session: AsyncSession, consent: Consent) -> OAuthClient:
    application = await session.scalar(
        select(OAuthClient).where(OAuthClient.client_id == consent.client_id)
    )
    if application is None or consent.redirect_uri not in application.redirect_uris:
        raise OAuthError("Aplicação ou URI de redirecionamento inválida.")
    return application


async def prepare_consent(
    db: Database, consent: Consent, session_id: str
) -> tuple[OAuthClient, str]:
    application = await db.read(lambda session: _load_application(session, consent))
    expires_at = datetime.now(UTC) + _CONSENT_TTL
    token = seal(
        {
            **consent.model_dump(mode="json"),
            "session": _digest(session_id),
            "exp": int(expires_at.timestamp()),
        },
        _CONSENT_KEY,
    )
    return application, token


def _redirect(consent: Consent, **params: str) -> str:
    if consent.state is not None:
        params["state"] = consent.state
    separator = "&" if "?" in consent.redirect_uri else "?"
    return f"{consent.redirect_uri}{separator}{urlencode(params)}"


def _open_consent(token: str, session_id: str) -> Consent:
    try:
        claims = unseal(token, _CONSENT_KEY, now=datetime.now(UTC))
        if not compare_digest(claims["session"], _digest(session_id)):
            raise ValueError
        consent = Consent.model_validate(claims)
        granted_scopes(consent.scopes)
    except JoseError, KeyError, TypeError, ValueError:
        raise OAuthError("Pedido de autorização inválido ou expirado.") from None
    return consent


async def decide_consent(
    db: Database,
    token: str,
    session_id: str,
    credentials: Credentials,
    *,
    approved: bool,
) -> str:
    consent = _open_consent(token, session_id)

    async def issue(session: AsyncSession) -> str:
        await _load_application(session, consent)
        if not approved:
            return _redirect(consent, error="access_denied")
        now = datetime.now(UTC)
        record = OAuthAuthorizationCode(
            id=uuid4(), salt=secrets.token_bytes(32), expires_at=now + _CODE_TTL
        )
        code = seal(
            {
                **consent.model_dump(mode="json", exclude={"state", "redirect_uri"}),
                "redirect_digest": _digest(consent.redirect_uri),
                **login_claims(credentials),
            },
            _code_key(record),
            record_id=record.id,
        )
        await session.execute(
            delete(OAuthAuthorizationCode).where(
                OAuthAuthorizationCode.expires_at <= now
            )
        )
        session.add(record)
        return _redirect(consent, code=code)

    return await db.write(issue)


async def _take_code(session: AsyncSession, code: str) -> dict | None:
    """Consome o código (uso único) e devolve seus claims, se ainda válido."""
    try:
        record_id, encrypted = split_sealed(code)
    except ValueError:
        return None
    record = await session.get(OAuthAuthorizationCode, record_id, with_for_update=True)
    if record is None:
        return None
    await session.delete(record)
    now = datetime.now(UTC)
    if record.expires_at <= now:
        return None
    try:
        return unseal(encrypted, _code_key(record), now=now)
    except JoseError, TypeError, ValueError:
        return None


def _matches(
    claims: dict,
    application: OAuthClient,
    *,
    redirect_uri: str,
    code_verifier: str,
) -> bool:
    try:
        return (
            claims["client_id"] == application.client_id
            and compare_digest(claims["redirect_digest"], _digest(redirect_uri))
            and redirect_uri in application.redirect_uris
            and compare_digest(claims["code_challenge"], _s256(code_verifier))
        )
    except KeyError, TypeError:
        return False


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
    async def exchange(session: AsyncSession) -> TokenPair | None:
        application = await authenticate_client(
            session, client_id, client_secret, proof=proof
        )
        claims = await _take_code(session, code)
        if claims is None or not _matches(
            claims, application, redirect_uri=redirect_uri, code_verifier=code_verifier
        ):
            return None
        try:
            credentials = Credentials.model_validate(claims)
            scopes = granted_scopes(claims["scopes"])
        except KeyError, TypeError, ValueError:
            return None
        return await create_token_pair(
            session,
            client_id=client_id,
            credentials=credentials,
            accepted=scopes,
            authenticated_client=application.confidential,
            proof=proof,
        )

    # Falhar com `None` deixa o write gravar o consumo do código.
    pair = await db.write(exchange)
    if pair is None:
        raise InvalidToken("Código de autorização inválido ou expirado.")
    return pair
