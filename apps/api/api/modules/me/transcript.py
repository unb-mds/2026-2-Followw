from uuid import UUID

from sigaa_client import AcademicTranscript, TranscriptCompletion
from sqlalchemy import delete, insert, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.models import Curriculum, Subject, UserCompletedSubject, UserTranscript
from api.schemas import normalize


class TranscriptRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def curriculum_code(self, user_id: UUID) -> str | None:
        transcript = await self._session.get(UserTranscript, user_id)
        return transcript.curriculum_code if transcript else None

    async def match_curriculum(self, course_id: int | None, code: str) -> UUID | None:
        return await self._session.scalar(
            select(Curriculum.id).where(
                Curriculum.course_id == course_id, Curriculum.code == code
            )
        )

    async def clear(self, user_id: UUID) -> None:
        await self._session.execute(
            delete(UserTranscript).where(UserTranscript.user_id == user_id)
        )

    async def save(self, user_id: UUID, transcript: AcademicTranscript) -> None:
        upsert = pg_insert(UserTranscript).values(
            user_id=user_id, curriculum_code=transcript.curriculum_code
        )
        await self._session.execute(
            upsert.on_conflict_do_update(
                index_elements=[UserTranscript.user_id],
                set_={"curriculum_code": upsert.excluded.curriculum_code},
            )
        )
        await self._session.execute(
            delete(UserCompletedSubject).where(UserCompletedSubject.user_id == user_id)
        )
        completed = {
            normalize(code): kind for code, kind in transcript.completed.items()
        }
        codes = await self._session.scalars(
            select(Subject.code).where(Subject.code.in_(completed))
        )
        rows = [
            {"user_id": user_id, "subject_code": code, "kind": completed[code]}
            for code in codes
        ]
        if rows:
            await self._session.execute(insert(UserCompletedSubject), rows)

    async def completed(self, user_id: UUID) -> dict[str, TranscriptCompletion]:
        rows = await self._session.execute(
            select(UserCompletedSubject.subject_code, UserCompletedSubject.kind).where(
                UserCompletedSubject.user_id == user_id
            )
        )
        return {code: kind for code, kind in rows}
