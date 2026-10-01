import json
import re
import unicodedata
from functools import cache
from pathlib import Path
from typing import Annotated

from fastapi import Depends
from sigaa_client import PublicClassroom, SigaaSearchError, Unit

from api.dependencies.sigaa_public import SigaaPublicClientDep

_CODE_RE = re.compile(r"([A-Z]+)[0-9]+")


class PublicClassroomService:
    def __init__(self, client: SigaaPublicClientDep) -> None:
        self._client = client

    async def search(
        self,
        unit: str | None = None,
        semester: str | None = None,
        *,
        contains: str | None = None,
        local: str | None = None,
        code: str | None = None,
    ) -> list[PublicClassroom]:
        prefix = None
        if code is not None:
            code = code.strip().upper()
            match = _CODE_RE.fullmatch(code)
            if match is None:
                raise SigaaSearchError(
                    "Código inválido; use letras seguidas de números, como MAT0031."
                )
            prefix = match[1]
        if unit is not None:
            units = [unit.strip()]
        elif prefix is not None:
            units = _code_units().get(prefix, [])
            if not units:
                raise SigaaSearchError(
                    f"Prefixo `{prefix}` não mapeado. Informe `unit` junto de `code` para buscar nessa unidade."
                )
        else:
            raise SigaaSearchError(
                "Informe `unit` ou o código completo da disciplina em `code`."
            )

        year = period = None
        if semester is not None:
            year, period = map(int, semester.split("."))
        classrooms = []
        for selected in units:
            classrooms.extend(
                await self._client.classrooms.search(selected, year=year, period=period)
            )
        if code is not None:
            classrooms = list(
                dict.fromkeys(
                    classroom
                    for classroom in classrooms
                    if (classroom.subject.code or "").strip().upper() == code
                )
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


@cache
def _code_units() -> dict[str, list[int]]:
    path = Path(__file__).resolve().parents[1] / "data/classroom_code_units.json"
    return json.loads(path.read_text(encoding="utf-8"))["prefixes"]


PublicClassroomServiceDep = Annotated[PublicClassroomService, Depends()]
