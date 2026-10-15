from typing import Annotated, Literal

from fastapi import Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.main import DatabaseDep
from api.db.models import Curriculum, Requirements, Subject
from api.modules.public_courses.repository import CourseCurriculumRepository


class CurriculumOption(BaseModel):
    model_config = ConfigDict(frozen=True, from_attributes=True)

    sigaa_id: int
    code: str
    valid_from: str
    matrix: str
    shift: Literal["D", "N"] | None


class CurriculumSubject(BaseModel):
    model_config = ConfigDict(frozen=True)

    code: str
    name: str | None = None
    hours: int | None = None
    unity: str | None = None
    prerequisites: Requirements | None = None
    corequisites: Requirements | None = None
    equivalences: Requirements | None = None


class CurriculumPeriod(BaseModel):
    model_config = ConfigDict(frozen=True)

    period: int
    subjects: list[CurriculumSubject]


class CourseCurriculum(CurriculumOption):
    course_id: int
    entry_semester: str
    fallback_used: bool
    periods: list[CurriculumPeriod]
    complementary: list[CurriculumSubject]


class CurriculumConflictDetail(BaseModel):
    message: str
    options: list[CurriculumOption]


class CurriculumConflict(BaseModel):
    detail: CurriculumConflictDetail


class PublicCourseService:
    def __init__(self, db: DatabaseDep) -> None:
        self._db = db

    async def get_curriculum(
        self,
        course_id: int,
        entry_semester: str,
        curriculum_sigaa_id: int | None = None,
    ) -> CourseCurriculum:
        return await self._db.read(
            lambda session: _load(
                session, course_id, entry_semester, curriculum_sigaa_id
            )
        )


async def _load(
    session: AsyncSession,
    course_id: int,
    entry_semester: str,
    curriculum_sigaa_id: int | None,
) -> CourseCurriculum:
    repository = CourseCurriculumRepository(session)
    if await repository.get_course(course_id) is None:
        raise HTTPException(404, "Curso não encontrado.")
    curricula = await repository.list_curricula(course_id)
    if not curricula:
        raise HTTPException(404, "Curso sem currículos ativos cadastrados.")
    previous = [
        item.valid_from for item in curricula if item.valid_from <= entry_semester
    ]
    valid_from = (
        max(previous) if previous else min(item.valid_from for item in curricula)
    )
    options = [item for item in curricula if item.valid_from == valid_from]
    selected = _select(options, curriculum_sigaa_id)
    periods: dict[int, list[CurriculumSubject]] = {0: []}
    complementary = []
    for component, subject in await repository.list_components(selected.id):
        item = _subject(component.subject_code, subject)
        if component.kind == "complementary":
            complementary.append(item)
        else:
            periods.setdefault(component.period, []).append(item)
    return CourseCurriculum(
        **CurriculumOption.model_validate(selected).model_dump(),
        course_id=course_id,
        entry_semester=entry_semester,
        fallback_used=not previous,
        periods=[
            CurriculumPeriod(period=period, subjects=items)
            for period, items in sorted(periods.items())
        ],
        complementary=complementary,
    )


def _select(options: list[Curriculum], wanted: int | None) -> Curriculum:
    if wanted is not None:
        for item in options:
            if item.sigaa_id == wanted:
                return item
        raise HTTPException(
            404, "Matriz não disponível para o curso e semestre de ingresso informados."
        )
    if len(options) > 1:
        detail = CurriculumConflictDetail(
            message="Há mais de uma matriz para o semestre selecionado; informe curriculum_sigaa_id.",
            options=[CurriculumOption.model_validate(item) for item in options],
        )
        raise HTTPException(409, detail.model_dump(mode="json"))
    return options[0]


def _subject(code: str, subject: Subject | None) -> CurriculumSubject:
    if subject is None:
        return CurriculumSubject(code=code)
    return CurriculumSubject(
        code=code,
        name=subject.name,
        hours=subject.hours,
        unity=subject.unity.code if subject.unity else None,
        prerequisites=subject.prerequisites,
        corequisites=subject.corequisites,
        equivalences=subject.equivalences,
    )


PublicCourseServiceDep = Annotated[PublicCourseService, Depends()]
