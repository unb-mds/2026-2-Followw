from datetime import date
from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel, Field, ValidationError
from sigaa_client import ClassroomFrequency
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.main import Database
from api.modules.classrooms.repository import (
    ClassroomRepository,
    manual_entries,
    recorded_lessons,
)
from api.modules.classrooms.service import ClassroomService

ManualStatus = Literal["presente", "ausente", "cancelada"]


class ManualAttendanceEntry(BaseModel):
    occurred_on: date
    position: int = Field(ge=0)
    status: ManualStatus
    manual: Literal[True] = True


async def list_manual(
    service: ClassroomService, db: Database, classroom_id: str
) -> list[ManualAttendanceEntry]:
    link = await service.get_link(classroom_id)

    async def read(session: AsyncSession) -> list[ManualAttendanceEntry]:
        repository = ClassroomRepository(session)
        cached = await repository.get_frequency(link.row.id)
        if cached is None:
            return []
        try:
            recorded = recorded_lessons(ClassroomFrequency.model_validate(cached.data))
        except ValidationError:
            return []
        entries = []
        for item in manual_entries(cached.data):
            try:
                entry = ManualAttendanceEntry.model_validate(item)
            except ValidationError:
                continue
            if (entry.occurred_on, entry.position) not in recorded:
                entries.append(entry)
        return sorted(entries, key=lambda entry: (entry.occurred_on, entry.position))

    return await db.read(read)


async def save_manual(
    service: ClassroomService,
    db: Database,
    classroom_id: str,
    entry: ManualAttendanceEntry,
) -> ManualAttendanceEntry:
    await service.get_frequency(classroom_id)
    link = await service.get_link(classroom_id)

    async def write(session: AsyncSession) -> None:
        repository = ClassroomRepository(session)
        if not await repository.save_manual_attendance(
            link.row.id, entry.model_dump(mode="json")
        ):
            raise HTTPException(
                409, "A frequência desta aula já foi registrada no SIGAA."
            )

    await db.write(write)
    return entry


async def delete_manual(
    service: ClassroomService,
    db: Database,
    classroom_id: str,
    occurred_on: date,
    position: int,
) -> None:
    link = await service.get_link(classroom_id)
    await db.write(
        lambda session: ClassroomRepository(session).delete_manual_attendance(
            link.row.id, occurred_on, position
        )
    )
