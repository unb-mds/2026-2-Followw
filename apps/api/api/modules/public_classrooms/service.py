from typing import Annotated

from fastapi import Depends, HTTPException, status
from sigaa_client import PublicClassroom, SigaaSearchError, lookup_key

from api.db.main import DatabaseDep
from api.db.units import find_unit
from api.modules.public_classrooms.code import classroom_code_prefix
from api.modules.public_classrooms.repository import UnitIndexRepository
from api.schemas import UnitRef
from api.sigaa import SigaaPublicClientDep


class PublicClassroomService:
    def __init__(self, client: SigaaPublicClientDep, db: DatabaseDep) -> None:
        self._client = client
        self._db = db

    async def search(
        self,
        unit: int | str | None = None,
        semester: str | None = None,
        *,
        q: str | None = None,
        local: str | None = None,
        code: str | None = None,
        number: int | None = None,
    ) -> list[PublicClassroom]:
        """`unit` ou `code` já validados pelo router; `code` vem em caixa alta."""
        prefix = classroom_code_prefix(code)
        units: list[int]
        if isinstance(unit, int):
            units = [unit]
        elif unit is not None:
            found = await self._db.read(lambda session: find_unit(session, unit))
            units = [found.id]
        else:
            units = list(
                await self._db.read(
                    lambda session: UnitIndexRepository(session).unit_ids(prefix)
                )
            )
            if not units:
                raise SigaaSearchError(
                    f"Prefixo `{prefix}` não encontrado nos componentes conhecidos. "
                    "Ele pode não existir no SIGAA ou ainda não ter sido mapeado. "
                    "Informe `unit` junto de `code` para buscar diretamente nessa unidade."
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
                    scope = f"na unidade `{unit}`"
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
        needle = lookup_key(q or "")
        if needle:
            classrooms = [
                classroom
                for classroom in classrooms
                if any(
                    needle in lookup_key(value)
                    for value in (
                        classroom.subject.name,
                        classroom.subject.code or "",
                        *classroom.professors,
                    )
                )
            ]
        location = lookup_key(local or "")
        if not location:
            return classrooms
        return [
            classroom
            for classroom in classrooms
            if location
            in lookup_key(
                " - ".join(
                    part for part in (classroom.subject.unit, classroom.room) if part
                )
            )
        ]

    async def list_units(self, q: str | None = None) -> list[UnitRef]:
        units = await self._client.classrooms.list_units(q)
        codes = await self._db.read(
            lambda session: UnitIndexRepository(session).unit_codes(
                [unit.id for unit in units]
            )
        )
        return [
            UnitRef(id=unit.id, code=codes.get(unit.id), name=unit.name)
            for unit in units
        ]


PublicClassroomServiceDep = Annotated[PublicClassroomService, Depends()]
