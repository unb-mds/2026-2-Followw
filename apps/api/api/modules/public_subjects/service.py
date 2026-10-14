from typing import Annotated

from fastapi import Depends, HTTPException, status
from pydantic import ConfigDict
from sigaa_client import lookup_key
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.main import DatabaseDep
from api.db.models import Requirements, Unity
from api.modules.public_subjects.repository import SubjectCatalogRepository
from api.schemas import ClassroomOffer, UserSubject


class SubjectClassroom(ClassroomOffer):
    model_config = ConfigDict(frozen=True, from_attributes=True)

    sigaa_id: int | None = None
    number: str
    semester: str
    schedule: str | None = None
    room: str | None = None


class CatalogSubject(UserSubject):
    """O componente com as turmas do semestre consultado e os requisitos."""

    # OU de Es: `[["A", "B"], ["C"]]` é `(A E B) OU C`; nulo quando desconhecido.
    prerequisites: Requirements | None = None
    corequisites: Requirements | None = None
    equivalences: Requirements | None = None
    classrooms: list[SubjectClassroom]


class PublicSubjectService:
    def __init__(self, db: DatabaseDep) -> None:
        self._db = db

    async def search(
        self,
        q: str | None = None,
        *,
        code: str | None = None,
        unit: str | None = None,
        semester: str | None = None,
    ) -> list[CatalogSubject]:
        if q is None and code is None and unit is None:
            raise _invalid("Informe `q`, `code` ou `unit`.")
        return await self._db.read(
            lambda session: _search(session, q, code, unit, semester)
        )


async def _search(
    session: AsyncSession,
    q: str | None,
    code: str | None,
    unit: str | None,
    semester: str | None,
) -> list[CatalogSubject]:
    repository = SubjectCatalogRepository(session)
    unity_id = None
    if unit is not None:
        unity_id = _resolve_unity(await repository.list_unities(), unit.strip())
    subjects = await repository.list_subjects(
        code=code.strip().upper() if code is not None else None,
        unity_id=unity_id,
        semester=semester,
    )
    needle = lookup_key(q or "")
    return [
        CatalogSubject(
            code=subject.code,
            name=subject.name,
            hours=subject.hours,
            unity=subject.unity.code if subject.unity else None,
            prerequisites=subject.prerequisites,
            corequisites=subject.corequisites,
            equivalences=subject.equivalences,
            classrooms=[
                SubjectClassroom.model_validate(classroom)
                for classroom in sorted(subject.classrooms, key=lambda c: c.number)
            ],
        )
        for subject in subjects
        if needle in lookup_key(subject.name)
    ]


def _resolve_unity(unities: list[Unity], wanted: str) -> int:
    for unity in unities:
        if wanted == str(unity.id) or wanted.upper() == unity.code:
            return unity.id
    raise _invalid(f"Unidade `{wanted}` não encontrada.")


def _invalid(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=detail
    )


PublicSubjectServiceDep = Annotated[PublicSubjectService, Depends()]
