import unicodedata
from typing import Annotated

from fastapi import Depends
from sigaa_client import PublicClassroom, Unit

from api.dependencies.sigaa_public import SigaaPublicClientDep


class PublicClassroomService:
    def __init__(self, client: SigaaPublicClientDep) -> None:
        self._client = client

    async def search(
        self,
        unit: str,
        semester: str | None = None,
        *,
        contains: str | None = None,
        local: str | None = None,
    ) -> list[PublicClassroom]:
        year = period = None
        if semester is not None:
            year, period = map(int, semester.split("."))
        classrooms = await self._client.classrooms.search(
            unit.strip(), year=year, period=period
        )
        needle = _normalize_search(contains or "")
        if needle:
            classrooms = [
                classroom
                for classroom in classrooms
                if any(
                    needle in _normalize_search(value)
                    for value in (
                        classroom.subject.name,
                        classroom.subject.code or "",
                        *(teacher.name for teacher in classroom.teachers),
                    )
                )
            ]
        location = _normalize_search(local or "")
        if not location:
            return classrooms
        return [
            classroom
            for classroom in classrooms
            if location
            in _normalize_search(
                " - ".join(
                    part for part in (classroom.subject.unity, classroom.room) if part
                )
            )
        ]

    async def list_units(self, contains: str | None = None) -> list[Unit]:
        return await self._client.classrooms.list_units(contains)


def _normalize_search(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value.casefold())
    return " ".join(
        "".join(char for char in normalized if not unicodedata.combining(char)).split()
    )


PublicClassroomServiceDep = Annotated[PublicClassroomService, Depends()]
