import secrets
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from joserfc.errors import JoseError
from joserfc.jwk import OctKey
from pydantic import BaseModel, ValidationError
from sigaa_client import AuthenticationFailed, Credentials, SigaaClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from api.core.config import settings
from api.crypto import decrypt_claims, derive_secret, encrypt_claims
from api.db.main import Database
from api.db.models import OAuthGrant
from api.modules.oauth.proof import InvalidProof, Proof
from api.modules.oauth.scopes import Scope, granted_scopes

MAX_TOKEN_LENGTH = 16384


class InvalidToken(ValueError):
    pass


class Access(BaseModel):
    credentials: Credentials
    session_token: str | None
    scopes: frozenset[Scope]


@dataclass(frozen=True)
class TokenPair:
    grant_id: UUID
    access_token: str = field(repr=False)
    refresh_token: str = field(repr=False)
    expires_in: int
    scopes: tuple[Scope, ...]
    credentials: Credentials = field(repr=False)


def _deadline(now: datetime) -> datetime:
    return now + timedelta(minutes=settings.refresh_token_expire_minutes)


def _key(grant: OAuthGrant, purpose: str) -> OctKey:
    return OctKey.import_key(
        derive_secret(
            settings.oauth_secret_key, f"followw:oauth:{grant.id}:{purpose}", grant.salt
        )
    )


def _seal(grant: OAuthGrant, purpose: str, claims: dict) -> str:
    return f"{grant.id}.{encrypt_claims(claims, _key(grant, purpose))}"


def _issue_access(
    grant: OAuthGrant, login: dict, session_token: str | None, now: datetime
) -> tuple[str, int]:
    expires = min(
        now + timedelta(minutes=settings.access_token_expire_minutes), grant.expires_at
    )
    token = _seal(
        grant,
        "access",
        {**login, "session_token": session_token, "exp": int(expires.timestamp())},
    )
    return token, max(0, int((expires - now).total_seconds()))


async def issue_tokens(
    db: Database,
    *,
    client_id: str,
    credentials: Credentials,
    accepted: Iterable[str],
    authenticated_client: bool,
    session_token: str | None = None,
    proof: Proof | None = None,
) -> TokenPair:
    """Recebe o aceite validado pela autorização. Clientes públicos exigem a prova verificada."""
    if not authenticated_client and proof is None:
        raise InvalidProof("Clientes públicos precisam comprovar a posse da chave.")
    scopes = granted_scopes(accepted)

    async def create(session: AsyncSession) -> TokenPair:
        if proof is not None:
            await proof.consume(session)
        now = datetime.now(UTC)
        grant = OAuthGrant(
            id=uuid4(),
            client_id=client_id,
            confidential=authenticated_client,
            registration=credentials.registration,
            scopes=scopes,
            expires_at=_deadline(now),
            salt=secrets.token_bytes(32),
            key_thumbprint=proof.thumbprint if proof else None,
        )
        session.add(grant)
        login = {
            "registration": credentials.registration,
            "password": credentials.password.get_secret_value(),
        }
        access_token, expires_in = _issue_access(grant, login, session_token, now)
        return TokenPair(
            grant.id,
            access_token,
            _seal(grant, "refresh", login),
            expires_in,
            tuple(scopes),
            credentials,
        )

    return await db.write(create)


async def _open(
    session: AsyncSession, encoded: str, purpose: str
) -> tuple[OAuthGrant, dict]:
    try:
        grant_id, token = encoded.split(".", 1)
        if len(encoded) > MAX_TOKEN_LENGTH or token.count(".") != 4:
            raise ValueError
        grant = await session.get(OAuthGrant, UUID(grant_id))
        now = datetime.now(UTC)
        if grant is None or grant.expires_at <= now:
            raise ValueError
        claims = decrypt_claims(token, _key(grant, purpose))
        if purpose == "access" and claims["exp"] <= now.timestamp():
            raise ValueError
    except (JoseError, KeyError, ValueError, TypeError) as error:
        raise InvalidToken("Token OAuth inválido ou expirado.") from error
    return grant, claims


async def read_access(db: Database, token: str) -> Access:
    async def read(session: AsyncSession) -> Access:
        grant, claims = await _open(session, token, "access")
        try:
            return Access(
                credentials=Credentials.model_validate(claims),
                session_token=claims["session_token"],
                scopes=frozenset(grant.scopes),
            )
        except (KeyError, ValidationError) as error:
            raise InvalidToken("Token OAuth inválido ou expirado.") from error

    return await db.read(read)


async def renew_access(
    db: Database,
    refresh_token: str,
    *,
    client_id: str,
    authenticated_client: bool,
    proof: Proof | None = None,
) -> TokenPair:
    """A camada de aplicações autentica o cliente confidencial antes da chamada."""

    async def authorize(session: AsyncSession) -> tuple[OAuthGrant, dict]:
        grant, login = await _open(session, refresh_token, "refresh")
        if grant.client_id != client_id:
            raise InvalidToken("Token de outra aplicação.")
        if grant.confidential and not authenticated_client:
            raise InvalidToken("A aplicação precisa se autenticar.")
        if grant.key_thumbprint is not None:
            if proof is None or proof.thumbprint != grant.key_thumbprint:
                raise InvalidProof("Prova da instalação exigida.")
            await proof.consume(session)
        return grant, login

    authorized, login = await db.write(authorize)
    credentials = Credentials.model_validate(login)
    try:
        async with SigaaClient(credentials=credentials) as client:
            session_token = await client.authenticate()
    except AuthenticationFailed as error:
        raise InvalidToken("A credencial da autorização expirou.") from error

    async def renew(session: AsyncSession) -> TokenPair:
        grant = await session.get(OAuthGrant, authorized.id, with_for_update=True)
        now = datetime.now(UTC)
        if grant is None or grant.salt != authorized.salt or grant.expires_at <= now:
            raise InvalidToken("Autorização revogada ou expirada durante a renovação.")
        grant.expires_at = _deadline(now)
        access_token, expires_in = _issue_access(grant, login, session_token, now)
        return TokenPair(
            grant.id,
            access_token,
            refresh_token,
            expires_in,
            tuple(Scope(value) for value in grant.scopes),
            credentials,
        )

    return await db.write(renew)


async def revoke(db: Database, grant_id: UUID, *, registration: str) -> bool:
    """Indica se havia uma autorização desse estudante para revogar."""

    async def remove(session: AsyncSession) -> bool:
        result = await session.execute(
            delete(OAuthGrant).where(
                OAuthGrant.id == grant_id, OAuthGrant.registration == registration
            )
        )
        return result.rowcount > 0

    return await db.write(remove)
