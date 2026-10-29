import asyncio
from typing import Annotated

from fastapi import Depends

from api.modules.public_professors.service import ProfessorServiceDep
from api.modules.public_search.schemas import SearchResult
from api.modules.public_subjects.service import PublicSubjectServiceDep


class SearchService:
    def __init__(
        self,
        professors: ProfessorServiceDep,
        subjects: PublicSubjectServiceDep,
    ) -> None:
        self._professors = professors
        self._subjects = subjects

    async def search(
        self,
        q: str,
        unit: int | str | None = None,
        limit_professors: int = 20,
    ) -> SearchResult:
        subject_query = q[:32]
        professor_page, subjects = await asyncio.gather(
            self._professors.list(
                q=q,
                unit=unit,
                semester=None,
                page=1,
                page_size=limit_professors,
            ),
            self._subjects.search(q=subject_query, unit=unit),
        )
        return SearchResult(professors=professor_page.items, subjects=subjects)


SearchServiceDep = Annotated[SearchService, Depends()]
