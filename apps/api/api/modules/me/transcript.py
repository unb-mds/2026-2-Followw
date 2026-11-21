from datetime import datetime
from uuid import UUID

from sqlalchemy import delete, insert, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.models import Subject, User, UserCompletedSubject
from api.schemas import normalize


class TranscriptRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def clear(self, user_id: UUID) -> None:
        await self._session.execute(
            delete(UserCompletedSubject).where(UserCompletedSubject.user_id == user_id)
        )

    async def save(self, user_id: UUID, codes: set[str], synced_at: datetime) -> None:
        """Substitui os cumpridos; códigos fora do catálogo são ignorados."""
        await self.clear(user_id)
        known = await self._session.scalars(
            select(Subject.code).where(Subject.code.in_({normalize(c) for c in codes}))
        )
        rows = [{"user_id": user_id, "subject_code": code} for code in known]
        if rows:
            await self._session.execute(insert(UserCompletedSubject), rows)
        await self._session.execute(
            update(User)
            .where(User.id == user_id)
            .values(transcript_synced_at=synced_at)
        )

    async def completed(self, user_id: UUID) -> set[str]:
        codes = await self._session.scalars(
            select(UserCompletedSubject.subject_code).where(
                UserCompletedSubject.user_id == user_id
            )
        )
        return set(codes)
