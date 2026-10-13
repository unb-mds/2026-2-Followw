from typing import Annotated

from fastapi import Depends
from sigaa_client import SubjectLevel, SubjectSearchResult, SubjectType, TeachingLevel

from api.search import normalize_search
from api.sigaa import SigaaPublicClientDep


class PublicSubjectService:
    def __init__(self, client: SigaaPublicClientDep) -> None:
        self._client = client

    async def search(
        self,
        unit: str | None = None,
        *,
        level: SubjectLevel = TeachingLevel.GRADUACAO,
        type: SubjectType | None = None,
        code: str | None = None,
        name: str | None = None,
        contains: str | None = None,
    ) -> SubjectSearchResult:
        result = await self._client.subjects.search(
            unit, level=level, type=type, code=code, name=name
        )
        needle = normalize_search(contains or "")
        if not needle:
            return result
        items = tuple(
            subject
            for subject in result.items
            if any(
                needle in normalize_search(value)
                for value in (subject.code, subject.name)
            )
        )
        return result.model_copy(update={"items": items})


PublicSubjectServiceDep = Annotated[PublicSubjectService, Depends()]
