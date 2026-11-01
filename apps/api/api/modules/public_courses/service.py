import re
from collections.abc import Container, Iterable
from typing import Annotated, Literal, Protocol

from fastapi import Depends, HTTPException
from pydantic import BaseModel, ConfigDict, computed_field
from sqlalchemy.ext.asyncio import AsyncSession

from api.academic_calendar import parse_semester
from api.db.main import DatabaseDep
from api.db.models import Course, Curriculum, Subject
from api.db.units import find_unit
from api.modules.public_courses.repository import PublicCourseRepository
from api.modules.public_subjects.repository import SubjectCatalogRepository
from api.schemas import (
    CatalogRequirements,
    DisplayedRequirements,
    UnitRef,
    displayed_requirements,
    named_requirements,
    normalize,
    requirement_codes,
    unit_ref,
)

_REVISION_RE = re.compile(r"/(-?\d+)$")


class PublicCourse(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: int
    sigaa_id: int | None
    name: str
    shift: str | None
    unit: UnitRef
    # O seed só traz cursos de graduação do SIGAA; os criados pelo sync não têm nível.
    level: Literal["Graduação"] | None


class CurriculumOption(BaseModel):
    model_config = ConfigDict(frozen=True, from_attributes=True)

    sigaa_id: int
    code: str
    valid_from: str
    matrix: str
    shift: Literal["D", "N"] | None

    # O SIGAA escreve a matriz como "CURSO[/HABILITAÇÃO] - GRAU - MODALIDADE - TURNO".
    @computed_field
    @property
    def degree(self) -> str | None:
        return _matrix_part(self.matrix, -3)

    @computed_field
    @property
    def modality(self) -> str | None:
        return _matrix_part(self.matrix, -2)


class CurriculumSubject(DisplayedRequirements):
    model_config = ConfigDict(frozen=True)

    code: str
    name: str | None = None
    hours: int | None = None
    unit: UnitRef | None = None
    prerequisites: CatalogRequirements | None = None
    corequisites: CatalogRequirements | None = None
    equivalences: CatalogRequirements | None = None


class CurriculumPeriod(BaseModel):
    model_config = ConfigDict(frozen=True)

    period: int
    subjects: list[CurriculumSubject]


class CourseCurriculum(CurriculumOption):
    course_id: int
    entry_semester: str
    periods: list[CurriculumPeriod]
    complementary: list[CurriculumSubject]


class PublicCourseService:
    def __init__(self, db: DatabaseDep) -> None:
        self._db = db

    async def list_courses(
        self, q: str | None = None, unit: int | str | None = None
    ) -> list[PublicCourse]:
        return await self._db.read(lambda session: _list_courses(session, q, unit))

    async def get_course(self, course_id: int) -> PublicCourse:
        return await self._db.read(lambda session: _get_course(session, course_id))

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


async def _list_courses(
    session: AsyncSession, q: str | None, unit: int | str | None
) -> list[PublicCourse]:
    unit_id = (await find_unit(session, unit)).id if unit is not None else None
    courses = await PublicCourseRepository(session).list_courses(q, unit_id)
    return [_course(course) for course in courses]


async def _get_course(session: AsyncSession, course_id: int) -> PublicCourse:
    course = await PublicCourseRepository(session).get_course(course_id)
    if course is None:
        raise HTTPException(404, "Curso não encontrado.")
    return _course(course)


def _course(course: Course) -> PublicCourse:
    return PublicCourse(
        id=course.id,
        sigaa_id=course.sigaa_id,
        name=course.name,
        shift=course.shift,
        unit=UnitRef.model_validate(course.unit),
        level="Graduação" if course.sigaa_id is not None else None,
    )


async def _load(
    session: AsyncSession,
    course_id: int,
    entry_semester: str,
    curriculum_sigaa_id: int | None,
) -> CourseCurriculum:
    repository = PublicCourseRepository(session)
    if await repository.get_course(course_id) is None:
        raise HTTPException(404, "Curso não encontrado.")
    options = in_force(await repository.list_curricula(course_id), entry_semester)
    if not options:
        raise HTTPException(404, "Curso sem currículos ativos cadastrados.")
    selected = _select(options, curriculum_sigaa_id)
    components = await repository.list_components(selected.id)
    catalog = SubjectCatalogRepository(session)
    codes = requirement_codes(subject for _, subject in components if subject)
    names = await catalog.subject_names(codes)
    offered = {
        normalize(code) for code in await catalog.offered_subject_codes(codes, None)
    }
    matrix = {normalize(component.subject_code) for component, _ in components}
    periods: dict[int, list[CurriculumSubject]] = {0: []}
    complementary = []
    for component, subject in components:
        item = _subject(component.subject_code, subject, names, matrix, offered)
        if component.kind == "complementary":
            complementary.append(item)
        else:
            periods.setdefault(component.period, []).append(item)
    return CourseCurriculum(
        **CurriculumOption.model_validate(selected).model_dump(),
        course_id=course_id,
        entry_semester=entry_semester,
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
    return max(options, key=revision)


class Versioned(Protocol):
    sigaa_id: int
    code: str
    valid_from: str


def in_force[T: Versioned](curricula: Iterable[T], entry_semester: str) -> list[T]:
    """As matrizes da vigência mais recente até a entrada; se ela preceder todas, a mais antiga."""
    dated = [(term, c) for c in curricula if (term := parse_semester(c.valid_from))]
    if not dated:
        return []
    entry = parse_semester(entry_semester)
    previous = [term for term, _ in dated if entry is not None and term <= entry]
    valid_from = max(previous) if previous else min(term for term, _ in dated)
    return [c for term, c in dated if term == valid_from]


def revision(item: Versioned) -> tuple[int, int]:
    # O sufixo do código é a revisão da matriz (ex.: 2680/4).
    match = _REVISION_RE.search(item.code)
    return (int(match[1]) if match else 0, item.sigaa_id)


def _matrix_part(matrix: str, index: int) -> str | None:
    parts = [part.strip() for part in matrix.split(" - ")]
    return parts[index] or None if len(parts) >= 4 else None


def _subject(
    code: str,
    subject: Subject | None,
    names: dict[str, str],
    matrix: Container[str],
    offered: set[str],
) -> CurriculumSubject:
    if subject is None:
        return CurriculumSubject(code=code)
    return CurriculumSubject(
        code=code,
        name=subject.name,
        hours=subject.hours,
        unit=unit_ref(subject.unit),
        prerequisites=named_requirements(subject.prerequisites, names),
        corequisites=named_requirements(subject.corequisites, names),
        equivalences=named_requirements(subject.equivalences, names),
        **displayed_requirements(subject, names, matrix, offered),
    )


PublicCourseServiceDep = Annotated[PublicCourseService, Depends()]
