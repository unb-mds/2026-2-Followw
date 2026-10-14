from typing import Annotated

from fastapi import Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.main import DatabaseDep
from api.db.models import Unity
from api.modules.classrooms.service import UserSubject
from api.modules.public_subjects.repository import SubjectCatalogRepository
from api.search import normalize_search

_AMBIGUOUS_SAMPLE = 3


class SubjectClassroom(BaseModel):
    model_config = ConfigDict(frozen=True)

    sigaa_id: int | None = None
    number: str
    semester: str
    schedule: str | None = None
    room: str | None = None
    professors: tuple[str, ...] = ()
    vacancies: int | None = None
    occupied: int | None = None


class CatalogSubject(UserSubject):
    """O componente com as turmas do semestre consultado."""

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
        code.strip().upper() if code is not None else None, unity_id
    )
    if q is not None:
        needle = normalize_search(q)
        subjects = [s for s in subjects if needle in normalize_search(s.name)]

    semester = semester or await repository.latest_semester()
    classrooms: dict[str, list[SubjectClassroom]] = {s.code: [] for s in subjects}
    if semester is not None:
        for classroom in await repository.list_classrooms(classrooms.keys(), semester):
            classrooms[classroom.subject_code].append(
                SubjectClassroom(
                    sigaa_id=classroom.sigaa_id,
                    number=classroom.number,
                    semester=classroom.semester,
                    schedule=classroom.schedule,
                    room=classroom.room,
                    professors=classroom.professors,
                    vacancies=classroom.vacancies,
                    occupied=classroom.occupied,
                )
            )
    return [
        CatalogSubject(
            code=subject.code,
            name=subject.name,
            hours=subject.hours,
            unity=subject.unity.code if subject.unity else None,
            classrooms=classrooms[subject.code],
        )
        for subject in subjects
    ]


def _resolve_unity(unities: list[Unity], wanted: str) -> int:
    if wanted.isdigit():
        if not any(unity.id == int(wanted) for unity in unities):
            raise _invalid(f"Unidade `{wanted}` não encontrada.")
        return int(wanted)
    needle = normalize_search(wanted)
    matches = [unity for unity in unities if needle in normalize_search(unity.name)]
    if not matches:
        raise _invalid(f"Nenhuma unidade casa com `{wanted}`.")
    if len(matches) > 1:
        names = ", ".join(unity.name for unity in matches[:_AMBIGUOUS_SAMPLE])
        rest = len(matches) - _AMBIGUOUS_SAMPLE
        raise _invalid(
            f"`{wanted}` casa com {len(matches)} unidades: {names}"
            + (f" e mais {rest}." if rest > 0 else ".")
        )
    return matches[0].id


def _invalid(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=detail
    )


PublicSubjectServiceDep = Annotated[PublicSubjectService, Depends()]
