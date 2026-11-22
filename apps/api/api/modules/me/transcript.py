from datetime import datetime
from uuid import UUID

from sqlalchemy import delete, insert, select
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

    async def record_check(
        self, enrollment: User, codes: set[str] | None, checked_at: datetime
    ) -> None:
        user = await self._session.get(
            User, enrollment.id, with_for_update={"of": User}
        )
        if (
            user is None
            or user.registration != enrollment.registration
            or user.course_id != enrollment.course_id
            or user.transcript_synced_at is not None
        ):
            return
        user.transcript_checked_at = max(
            user.transcript_checked_at or checked_at, checked_at
        )
        if codes is None:
            return
        user.transcript_synced_at = checked_at
        await self.clear(user.id)
        known = await self._session.scalars(
            select(Subject.code).where(Subject.code.in_({normalize(c) for c in codes}))
        )
        rows = [{"user_id": user.id, "subject_code": code} for code in known]
        if rows:
            await self._session.execute(insert(UserCompletedSubject), rows)

    async def completed(self, user_id: UUID) -> set[str]:
        codes = await self._session.scalars(
            select(UserCompletedSubject.subject_code).where(
                UserCompletedSubject.user_id == user_id
            )
        )
        return set(codes)
