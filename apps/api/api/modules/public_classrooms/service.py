import unicodedata
from collections.abc import AsyncGenerator
from typing import Annotated

from fastapi import Depends, HTTPException, status
from sigaa_client import PublicClassroom, SigaaPublicClient, SigaaSearchError, Unit

from api.db.main import DatabaseDep
from api.modules.public_classrooms.code import classroom_code_prefix
from api.modules.public_classrooms.repository import UnitIndexRepository


async def get_sigaa_public_client() -> AsyncGenerator[SigaaPublicClient]:
    async with SigaaPublicClient() as client:
        yield client


SigaaPublicClientDep = Annotated[SigaaPublicClient, Depends(get_sigaa_public_client)]


class PublicClassroomService:
    def __init__(self, client: SigaaPublicClientDep, db: DatabaseDep) -> None:
        self._client = client
        self._db = db

    async def search(
        self,
        unit: str | None = None,
        semester: str | None = None,
        *,
        contains: str | None = None,
        local: str | None = None,
        code: str | None = None,
        number: int | None = None,
    ) -> list[PublicClassroom]:
        prefix = None
        if code is not None:
            code = code.strip().upper()
            prefix = classroom_code_prefix(code)
            if prefix is None:
                raise SigaaSearchError(
                    "Código inválido; use letras seguidas de números, como MAT0031."
                )
        if unit is not None:
            units = [unit.strip()]
        elif prefix is not None:
            units = await self._db.read(
                lambda session: UnitIndexRepository(session).unit_ids(prefix)
            )
            if not units:
                raise SigaaSearchError(
                    f"Prefixo `{prefix}` não encontrado nos componentes conhecidos. "
                    "Ele pode não existir no SIGAA ou ainda não ter sido mapeado. "
                    "Informe `unit` junto de `code` para buscar diretamente nessa unidade."
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
            if not classrooms:
                if unit is not None:
                    scope = f"na unidade `{unit.strip()}`"
                else:
                    names = await self._db.read(
                        lambda session: UnitIndexRepository(session).unit_names(units)
                    )
                    labels = "; ".join(
                        f"`{names.get(selected, 'Unidade')}` (ID {selected})"
                        for selected in units
                    )
                    scope = f"nas unidades mapeadas para o prefixo `{prefix}`: {labels}"
                term = (
                    f"no semestre `{semester}`"
                    if semester is not None
                    else "no semestre padrão do SIGAA"
                )
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=(
                        f"Nenhuma turma encontrada para o código `{code}` {scope} {term}. "
                        "A disciplina pode não existir ou não ter oferta nessas condições. "
                        "Confira `code`, `unit` e `semester`."
                    ),
                    headers={"Cache-Control": "no-store"},
                )
        if number is not None:
            classrooms = [
                classroom
                for classroom in classrooms
                if classroom.number.strip().lstrip("0") == str(number)
            ]
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
