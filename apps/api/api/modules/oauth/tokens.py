import secrets
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from joserfc.errors import JoseError
from joserfc.jwk import OctKey
from pydantic import BaseModel
from sigaa_client import Credentials
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from api.cookies import decrypt_claims, derive_secret, encrypt_claims
from api.core.config import settings
from api.db.main import Database
from api.db.models import OAuthGrant
from api.modules.oauth.proof import InvalidProof, Proof
from api.modules.oauth.scopes import Scope, granted_scopes


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
    scopes: tuple[str, ...]


def _deadline() -> datetime:
    return datetime.now(UTC) + timedelta(minutes=settings.refresh_token_expire_minutes)


def _key(grant: OAuthGrant, purpose: str) -> OctKey:
    return OctKey.import_key(
        derive_secret(
            settings.oauth_secret_key, f"followw:oauth:{grant.id}:{purpose}", grant.salt
        )
    )


def _seal(grant: OAuthGrant, purpose: str, claims: dict) -> str:
    return f"{grant.id}.{encrypt_claims(claims, _key(grant, purpose))}"


def _access(grant: OAuthGrant, login: dict, session_token: str | None) -> str:
    expires = datetime.now(UTC) + timedelta(
        minutes=settings.access_token_expire_minutes
    )
    return _seal(
        grant,
        "access",
        {
            **login,
            "session_token": session_token,
            "exp": int(min(expires, grant.expires_at).timestamp()),
        },
    )


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
        grant = OAuthGrant(
            id=uuid4(),
            client_id=client_id,
            confidential=authenticated_client,
            registration=credentials.registration,
            scopes=scopes,
            expires_at=_deadline(),
            salt=secrets.token_bytes(32),
            key_thumbprint=proof.thumbprint if proof else None,
        )
        session.add(grant)
        login = {
            "registration": credentials.registration,
            "password": credentials.password.get_secret_value(),
        }
        return TokenPair(
            grant.id,
            _access(grant, login, session_token),
            _seal(grant, "refresh", login),
            tuple(scopes),
        )

    return await db.write(create)


async def _open(
    session: AsyncSession, encoded: str, purpose: str
) -> tuple[OAuthGrant, dict]:
    try:
        grant_id, token = encoded.split(".", 1)
        if len(encoded) > 16384 or token.count(".") != 4:
            raise ValueError
        grant = await session.get(
            OAuthGrant, UUID(grant_id), with_for_update=purpose == "refresh"
        )
        if grant is None or grant.expires_at <= datetime.now(UTC):
            raise ValueError
        claims = decrypt_claims(token, _key(grant, purpose))
        if purpose == "access" and claims["exp"] <= datetime.now(UTC).timestamp():
            raise ValueError
    except (JoseError, KeyError, ValueError, TypeError) as error:
        raise InvalidToken("Token OAuth inválido ou expirado.") from error
    return grant, claims


async def read_access(db: Database, token: str) -> Access:
    async def read(session: AsyncSession) -> Access:
        grant, claims = await _open(session, token, "access")
        return Access(
            credentials=Credentials.model_validate(claims),
            session_token=claims["session_token"],
            scopes=frozenset(grant.scopes),
        )

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

    async def renew(session: AsyncSession) -> TokenPair:
        grant, login = await _open(session, refresh_token, "refresh")
        if grant.client_id != client_id:
            raise InvalidToken("Token de outra aplicação.")
        if grant.confidential and not authenticated_client:
            raise InvalidToken("A aplicação precisa se autenticar.")
        if grant.key_thumbprint is not None:
            if proof is None or proof.thumbprint != grant.key_thumbprint:
                raise InvalidProof("Prova da instalação exigida.")
            await proof.consume(session)
        grant.expires_at = _deadline()
        return TokenPair(
            grant.id, _access(grant, login, None), refresh_token, tuple(grant.scopes)
        )

    return await db.write(renew)


async def revoke(db: Database, grant_id: UUID, *, registration: str) -> None:
    async def remove(session: AsyncSession) -> None:
        await session.execute(
            delete(OAuthGrant).where(
                OAuthGrant.id == grant_id, OAuthGrant.registration == registration
            )
        )

    await db.write(remove)
