import asyncio
from collections.abc import Awaitable, Callable, Collection
from typing import Annotated, Any, Literal

from fastapi import Depends
from pydantic import BaseModel

from api.modules.public_courses.service import PublicCourse, PublicCourseServiceDep
from api.modules.public_professors.service import (
    PROFESSORS_PAGE_SIZE,
    ProfessorPage,
    ProfessorServiceDep,
)
from api.modules.public_subjects.service import CatalogSubject, PublicSubjectServiceDep
from api.sync import Sync

type SearchType = Literal["subjects", "courses", "professors"]


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
        types: Collection[SearchType] | None,
        unit: int | str | None,
        sync: Sync | None,
    ) -> SearchResult:
        searches: dict[SearchType, Callable[[], Awaitable[Any]]] = {
            "subjects": lambda: self._subjects.search(q, unit=unit, sync=sync),
            "courses": lambda: self._courses.list_courses(q, unit),
            "professors": lambda: self._professors.list(
                q, unit, None, 1, PROFESSORS_PAGE_SIZE
            ),
        }
        wanted = [name for name in searches if not types or name in types]
        # Espera todas as buscas antes de propagar a primeira falha.
        results = await asyncio.gather(
            *(searches[name]() for name in wanted), return_exceptions=True
        )
        for result in results:
            if isinstance(result, BaseException):
                raise result
        return SearchResult.model_validate(
            dict.fromkeys(searches) | dict(zip(wanted, results, strict=True))
        )


SearchServiceDep = Annotated[SearchService, Depends()]
