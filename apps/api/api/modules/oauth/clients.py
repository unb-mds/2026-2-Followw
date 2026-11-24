import hashlib
import hmac
import re
import secrets
from datetime import UTC, datetime
from urllib.parse import urlsplit
from uuid import UUID

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.main import Database
from api.db.models import OAuthClient, OAuthGrant
from api.modules.oauth.scopes import Scope

MAX_CLIENTS_PER_USER = 10
MAX_REDIRECT_URIS = 5
MAX_URI_LENGTH = 2048
MAX_CLIENT_NAME_LENGTH = 80
MAX_CLIENT_DESCRIPTION_LENGTH = 280
CLIENT_ID_PREFIX = "flw_app_"
CLIENT_SECRET_PREFIX = "flw_sec_"

_SCHEME_RE = re.compile(r"^[a-z][a-z0-9+.-]*$")
_LOOPBACK_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})
_FORBIDDEN_SCHEMES = frozenset(
    {"javascript", "data", "vbscript", "file", "blob", "about"}
)
_VALID_SCOPES = frozenset(Scope)


def validate_redirect_uri(uri: str, *, confidential: bool) -> str:
    """Valida redirect_uri segundo OAuth 2.1: sem fragment/wildcard; custom scheme só em público."""
    value = uri.strip()
    if not value or len(value) > MAX_URI_LENGTH:
        raise ValueError("URI de redirecionamento inválida.")
    if any(ord(ch) <= 32 or ord(ch) == 127 for ch in value):
        raise ValueError("URI de redirecionamento não pode conter espaços.")

    parsed = urlsplit(value)
    scheme = parsed.scheme.lower()
    if not scheme or not _SCHEME_RE.match(scheme):
        raise ValueError("URI de redirecionamento precisa de um esquema válido.")
    if parsed.fragment:
        raise ValueError("URI de redirecionamento não pode conter fragmento (#).")
    if "*" in (parsed.hostname or "") or "*" in parsed.path:
        raise ValueError("URI de redirecionamento não aceita wildcards (*).")

    if scheme == "https":
        if not parsed.hostname:
            raise ValueError("URI https precisa de um domínio válido.")
        return value

    if scheme == "http":
        if parsed.hostname not in _LOOPBACK_HOSTS:
            raise ValueError(
                "HTTP só é permitido para localhost, 127.0.0.1 ou [::1]; use HTTPS."
            )
        return value

    if scheme in _FORBIDDEN_SCHEMES:
        raise ValueError("Esquema de URI não permitido.")
    if confidential:
        raise ValueError(
            "Esquemas customizados só são permitidos para aplicações públicas."
        )
    if not parsed.netloc and not parsed.path:
        raise ValueError("URI customizada incompleta.")
    return value


def validate_homepage_url(url: str | None) -> str | None:
    if url is None:
        return None
    value = url.strip()
    if not value:
        return None
    if len(value) > MAX_URI_LENGTH or any(
        ord(ch) <= 32 or ord(ch) == 127 for ch in value
    ):
        raise ValueError("URL da página inicial inválida.")
    parsed = urlsplit(value)
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname:
        raise ValueError("URL da página inicial deve usar http:// ou https://.")
    return value


def generate_client_id() -> str:
    return f"{CLIENT_ID_PREFIX}{secrets.token_urlsafe(18)}"


def generate_client_secret() -> tuple[str, bytes, bytes]:
    plain = f"{CLIENT_SECRET_PREFIX}{secrets.token_urlsafe(32)}"
    salt = secrets.token_bytes(32)
    digest = hashlib.sha256(salt + plain.encode()).digest()
    return plain, salt, digest


class InvalidClient(ValueError):
    """Aplicação inexistente ou credenciais de cliente inválidas."""


def verify_client_secret(client: OAuthClient, secret: str) -> bool:
    if (
        not client.confidential
        or client.secret_salt is None
        or client.secret_hash is None
    ):
        return False
    candidate = hashlib.sha256(client.secret_salt + secret.encode()).digest()
    return hmac.compare_digest(client.secret_hash, candidate)


async def authenticate_client(
    db: Database, client_id: str, client_secret: str | None
) -> OAuthClient:
    """Valida a existência da aplicação cadastrada e o client_secret quando confidencial."""

    async def read(session: AsyncSession) -> OAuthClient | None:
        return await session.scalar(
            select(OAuthClient).where(OAuthClient.client_id == client_id)
        )

    client = await db.read(read)
    if client is None:
        raise InvalidClient("Aplicação não registrada.")
    if client.confidential:
        if client_secret is None or not verify_client_secret(client, client_secret):
            raise InvalidClient("Credenciais da aplicação inválidas.")
    elif client_secret is not None:
        raise InvalidClient("Aplicações públicas não aceitam client_secret.")
    return client


def _validate_redirect_list(uris: list[str], *, confidential: bool) -> list[str]:
    if not uris:
        raise ValueError("Informe ao menos uma URI de redirecionamento.")
    if len(uris) > MAX_REDIRECT_URIS:
        raise ValueError(
            f"Informe no máximo {MAX_REDIRECT_URIS} URIs de redirecionamento."
        )
    validated: list[str] = []
    seen: set[str] = set()
    for raw in uris:
        clean = validate_redirect_uri(raw, confidential=confidential)
        if clean in seen:
            raise ValueError("URIs de redirecionamento não podem se repetir.")
        seen.add(clean)
        validated.append(clean)
    return validated


def _clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


class OAuthClientCreate(BaseModel):
    name: str = Field(min_length=1, max_length=MAX_CLIENT_NAME_LENGTH)
    description: str | None = Field(
        default=None, max_length=MAX_CLIENT_DESCRIPTION_LENGTH
    )
    homepage_url: str | None = Field(default=None, max_length=MAX_URI_LENGTH)
    confidential: bool = False
    redirect_uris: list[str] = Field(min_length=1, max_length=MAX_REDIRECT_URIS)

    @field_validator("name")
    @classmethod
    def _clean_name(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Informe o nome da aplicação.")
        return stripped

    @field_validator("description")
    @classmethod
    def _clean_description(cls, value: str | None) -> str | None:
        return _clean_text(value)

    @field_validator("homepage_url")
    @classmethod
    def _check_homepage(cls, value: str | None) -> str | None:
        return validate_homepage_url(value)

    @model_validator(mode="after")
    def _check_redirects(self) -> OAuthClientCreate:
        self.redirect_uris = _validate_redirect_list(
            self.redirect_uris, confidential=self.confidential
        )
        return self


class OAuthClientUpdate(BaseModel):
    name: str | None = Field(
        default=None, min_length=1, max_length=MAX_CLIENT_NAME_LENGTH
    )
    description: str | None = Field(
        default=None, max_length=MAX_CLIENT_DESCRIPTION_LENGTH
    )
    homepage_url: str | None = Field(default=None, max_length=MAX_URI_LENGTH)
    redirect_uris: list[str] | None = Field(
        default=None, min_length=1, max_length=MAX_REDIRECT_URIS
    )

    @field_validator("name")
    @classmethod
    def _clean_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            raise ValueError("Informe o nome da aplicação.")
        return stripped

    @field_validator("description")
    @classmethod
    def _clean_description(cls, value: str | None) -> str | None:
        return _clean_text(value)

    @field_validator("homepage_url")
    @classmethod
    def _check_homepage(cls, value: str | None) -> str | None:
        return validate_homepage_url(value)

    @model_validator(mode="after")
    def _check_fields(self) -> OAuthClientUpdate:
        if not self.model_fields_set:
            raise ValueError("Informe ao menos um campo para atualizar.")
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("Informe o nome da aplicação.")
        if "redirect_uris" in self.model_fields_set and self.redirect_uris is None:
            raise ValueError("Informe ao menos uma URI de redirecionamento.")
        return self


class OAuthClientView(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    client_id: str
    name: str
    description: str | None
    homepage_url: str | None
    confidential: bool
    redirect_uris: list[str]
    created_at: datetime
    updated_at: datetime


class OAuthClientCreated(OAuthClientView):
    client_secret: str | None = Field(default=None, repr=False)


class OAuthClientSecret(BaseModel):
    client_id: str
    client_secret: str = Field(repr=False)


class OAuthGrantView(BaseModel):
    id: UUID
    client_id: str
    client_name: str | None
    client_description: str | None
    client_homepage_url: str | None
    confidential: bool
    scopes: list[Scope]
    created_at: datetime
    expires_at: datetime


async def list_clients(db: Database, owner_registration: str) -> list[OAuthClientView]:
    async def read(session: AsyncSession) -> list[OAuthClientView]:
        rows = (
            await session.scalars(
                select(OAuthClient)
                .where(OAuthClient.owner_registration == owner_registration)
                .order_by(OAuthClient.created_at.desc())
            )
        ).all()
        return [OAuthClientView.model_validate(row) for row in rows]

    return await db.read(read)


async def create_client(
    db: Database, owner_registration: str, body: OAuthClientCreate
) -> OAuthClientCreated:
    async def write(session: AsyncSession) -> OAuthClientCreated:
        # Serializa criações da mesma matrícula para evitar race condition no limite.
        await session.execute(
            select(
                func.pg_advisory_xact_lock(
                    func.hashtextextended(f"oauth_clients:{owner_registration}", 0)
                )
            )
        )
        count = await session.scalar(
            select(func.count())
            .select_from(OAuthClient)
            .where(OAuthClient.owner_registration == owner_registration)
        )
        if (count or 0) >= MAX_CLIENTS_PER_USER:
            raise HTTPException(
                422,
                f"Limite de {MAX_CLIENTS_PER_USER} aplicações por conta atingido.",
            )

        plain_secret: str | None = None
        salt: bytes | None = None
        digest: bytes | None = None
        if body.confidential:
            plain_secret, salt, digest = generate_client_secret()

        client = OAuthClient(
            client_id=generate_client_id(),
            owner_registration=owner_registration,
            name=body.name,
            description=body.description,
            homepage_url=body.homepage_url,
            confidential=body.confidential,
            redirect_uris=body.redirect_uris,
            secret_salt=salt,
            secret_hash=digest,
        )
        session.add(client)
        await session.flush()
        view = OAuthClientView.model_validate(client)
        return OAuthClientCreated(**view.model_dump(), client_secret=plain_secret)

    return await db.write(write)


async def _owned_client(
    session: AsyncSession, owner_registration: str, client_id: str
) -> OAuthClient:
    client = await session.scalar(
        select(OAuthClient).where(
            OAuthClient.client_id == client_id,
            OAuthClient.owner_registration == owner_registration,
        )
    )
    if client is None:
        raise HTTPException(404, "Aplicação não encontrada.")
    return client


async def update_client(
    db: Database, owner_registration: str, client_id: str, body: OAuthClientUpdate
) -> OAuthClientView:
    fields = body.model_fields_set

    async def write(session: AsyncSession) -> OAuthClientView:
        client = await _owned_client(session, owner_registration, client_id)
        if body.name is not None:
            client.name = body.name
        if "description" in fields:
            client.description = body.description
        if "homepage_url" in fields:
            client.homepage_url = body.homepage_url
        if body.redirect_uris is not None:
            # a regra de esquema depende do tipo gravado no banco
            try:
                client.redirect_uris = _validate_redirect_list(
                    body.redirect_uris, confidential=client.confidential
                )
            except ValueError as error:
                raise HTTPException(422, str(error)) from None
        await session.flush()
        await session.refresh(client)
        return OAuthClientView.model_validate(client)

    return await db.write(write)


async def rotate_client_secret(
    db: Database, owner_registration: str, client_id: str
) -> OAuthClientSecret:
    async def write(session: AsyncSession) -> OAuthClientSecret:
        client = await _owned_client(session, owner_registration, client_id)
        if not client.confidential:
            raise HTTPException(422, "Aplicações públicas não possuem client_secret.")
        plain, salt, digest = generate_client_secret()
        client.secret_salt = salt
        client.secret_hash = digest
        await session.flush()
        return OAuthClientSecret(client_id=client.client_id, client_secret=plain)

    return await db.write(write)


async def delete_client(db: Database, owner_registration: str, client_id: str) -> None:
    async def write(session: AsyncSession) -> None:
        client = await _owned_client(session, owner_registration, client_id)
        await session.execute(
            delete(OAuthGrant).where(OAuthGrant.client_id == client.client_id)
        )
        await session.delete(client)

    await db.write(write)


async def list_grants(db: Database, registration: str) -> list[OAuthGrantView]:
    now = datetime.now(UTC)

    async def read(session: AsyncSession) -> list[OAuthGrantView]:
        rows = (
            await session.execute(
                select(OAuthGrant, OAuthClient)
                .outerjoin(OAuthClient, OAuthGrant.client_id == OAuthClient.client_id)
                .where(
                    OAuthGrant.registration == registration,
                    OAuthGrant.expires_at > now,
                )
                .order_by(OAuthGrant.created_at.desc())
            )
        ).all()
        return [
            OAuthGrantView(
                id=grant.id,
                client_id=grant.client_id,
                client_name=client.name if client else None,
                client_description=client.description if client else None,
                client_homepage_url=client.homepage_url if client else None,
                confidential=grant.confidential,
                scopes=[
                    Scope(scope) for scope in grant.scopes if scope in _VALID_SCOPES
                ],
                created_at=grant.created_at,
                expires_at=grant.expires_at,
            )
            for grant, client in rows
        ]

    return await db.read(read)
