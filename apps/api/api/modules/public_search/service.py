import asyncio
from collections.abc import Collection
from typing import Annotated, Literal

from fastapi import Depends
from pydantic import BaseModel

from api.modules.public_courses.service import PublicCourse, PublicCourseServiceDep
from api.modules.public_professors.service import ProfessorPage, ProfessorServiceDep
from api.modules.public_subjects.service import CatalogSubject, PublicSubjectServiceDep
from api.sync import Sync

type SearchType = Literal["subjects", "courses", "professors"]

PROFESSORS_PAGE_SIZE = 50


class SearchResult(BaseModel):
    """Cada tipo no formato do seu endpoint; nulo quando não foi pedido."""

    subjects: list[CatalogSubject] | None
    courses: list[PublicCourse] | None
    professors: ProfessorPage | None


class SearchService:
    def __init__(
        self,
        subjects: PublicSubjectServiceDep,
        courses: PublicCourseServiceDep,
        professors: ProfessorServiceDep,
    ) -> None:
        self._subjects = subjects
        self._courses = courses
        self._professors = professors

    async def search(
        self,
        q: str,
        types: Collection[SearchType],
        unit: int | str | None,
        sync: Sync | None,
    ) -> SearchResult:
        # Espera todas as buscas antes de propagar a primeira falha.
        results = await asyncio.gather(
            self._subjects.search(q, unit=unit, sync=sync)
            if "subjects" in types
            else _skip(),
            self._courses.list_courses(q, unit) if "courses" in types else _skip(),
            self._professors.list(q, unit, None, 1, PROFESSORS_PAGE_SIZE)
            if "professors" in types
            else _skip(),
            return_exceptions=True,
        )
        for result in results:
            if isinstance(result, BaseException):
                raise result
        subjects, courses, professors = results
        return SearchResult(subjects=subjects, courses=courses, professors=professors)


async def _skip() -> None:
    return None


SearchServiceDep = Annotated[SearchService, Depends()]
