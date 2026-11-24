from hashlib import sha256
from hmac import compare_digest
from secrets import token_urlsafe
from uuid import UUID, uuid7

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import undefer

from api.db.models import OAuthApplication, OAuthGrant

MAX_REDIRECT_URI_LENGTH = 2048
_SECRET_BYTES = 32


class InvalidClient(ValueError):
    pass


def parse_client_id(client_id: str) -> UUID:
    try:
        identifier = UUID(client_id)
    except ValueError:
        raise InvalidClient from None
    if str(identifier) != client_id:
        raise InvalidClient
    return identifier


def _secret_hash(secret: str) -> bytes:
    return sha256(secret.encode()).digest()


class ApplicationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(
        self, owner: str, name: str, redirect_uris: list[str]
    ) -> tuple[OAuthApplication, str]:
        secret = token_urlsafe(_SECRET_BYTES)
        application = OAuthApplication(
            id=uuid7(),
            owner=owner,
            name=name,
            redirect_uris=redirect_uris,
            secret_hash=_secret_hash(secret),
        )
        self._session.add(application)
        await self._session.flush()
        return application, secret

    async def list_owned(
        self, owner: str, *, before: UUID | None, limit: int
    ) -> list[OAuthApplication]:
        query = select(OAuthApplication).where(OAuthApplication.owner == owner)
        if before is not None:
            query = query.where(OAuthApplication.id < before)
        return list(
            await self._session.scalars(
                query.order_by(OAuthApplication.id.desc()).limit(limit)
            )
        )

    async def update_owned(
        self, owner: str, client_id: UUID, **changes: str | list[str] | bytes
    ) -> OAuthApplication | None:
        return await self._session.scalar(
            update(OAuthApplication)
            .where(OAuthApplication.id == client_id, OAuthApplication.owner == owner)
            .values(**changes)
            .returning(OAuthApplication)
        )

    async def rotate(self, owner: str, client_id: UUID) -> str | None:
        secret = token_urlsafe(_SECRET_BYTES)
        updated = await self._session.scalar(
            update(OAuthApplication)
            .where(OAuthApplication.id == client_id, OAuthApplication.owner == owner)
            .values(secret_hash=_secret_hash(secret))
            .returning(OAuthApplication.id)
        )
        return secret if updated is not None else None

    async def delete(self, owner: str, client_id: UUID) -> bool:
        removed = await self._session.scalar(
            delete(OAuthApplication)
            .where(OAuthApplication.id == client_id, OAuthApplication.owner == owner)
            .returning(OAuthApplication.id)
        )
        if removed is None:
            return False
        await self._session.execute(
            delete(OAuthGrant).where(OAuthGrant.client_id == str(client_id))
        )
        return True

    async def get(
        self, client_id: UUID, *, lock: bool = False
    ) -> OAuthApplication | None:
        return await self._session.get(
            OAuthApplication,
            client_id,
            with_for_update={"read": True} if lock else None,
        )

    async def authenticate(
        self, client_id: str, secret: str, *, lock: bool = False
    ) -> OAuthApplication:
        application = await self._session.get(
            OAuthApplication,
            parse_client_id(client_id),
            options=[undefer(OAuthApplication.secret_hash)],
            with_for_update={"read": True} if lock else None,
        )
        if application is None or not compare_digest(
            application.secret_hash, _secret_hash(secret)
        ):
            raise InvalidClient
        return application
