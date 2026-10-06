from html import unescape
from typing import Annotated

from fastapi import Depends, HTTPException, status
from sigaa_client import ClassroomNotFound, News, NewsNotFound
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.models import ClassroomNews
from api.dependencies.cache import NO_DIRECTIVES, CacheControl
from api.dependencies.sigaa import SigaaClientDep
from api.dependencies.sync import SyncEngineDep
from api.repositories.classroom import ClassroomRepository
from api.repositories.news import NewsRepository
from api.services.classroom import ClassroomServiceDep, classroom_not_found
from api.services.sync import NEWS_CONTENT_TTL, NEWS_LIST_TTL, Cached, Task


class NewsService:
    def __init__(self, client: SigaaClientDep) -> None:
        self._client = client

    async def list_news(self, *, resolve_ids: bool = False) -> list[News]:
        news = await self._client.profile.list_news()
        if not resolve_ids or not news:
            return news

        # A home só cita turmas do semestre, então o portal basta para achar o `id`.
        current = {
            c.sigaa_id: c.id
            for c in await self._client.classrooms.list_current_classrooms()
        }
        by_classroom: dict[int, list[News]] = {}
        for item in news:
            sigaa_id = item.classroom_sigaa_id
            if sigaa_id is None or sigaa_id in by_classroom:
                continue
            classroom_id = current.get(sigaa_id)
            by_classroom[sigaa_id] = (
                await self._client.classrooms.list_classroom_news(classroom_id)
                if classroom_id is not None
                else []
            )

        result = []
        for item in news:
            matches = [
                candidate
                for candidate in by_classroom.get(item.classroom_sigaa_id, [])
                if candidate.published_on == item.published_on
                and _title(candidate.title) == _title(item.title)
            ]
            # A home não traz o ID: só associa quando título e dia são inequívocos.
            result.append(
                item.model_copy(update={"id": matches[0].id})
                if len(matches) == 1
                else item
            )
        return result


class ClassroomNewsService:
    def __init__(self, engine: SyncEngineDep, classrooms: ClassroomServiceDep) -> None:
        self._engine = engine
        self._classrooms = classrooms

    async def list_classroom_news(
        self, classroom_id: str, cache: CacheControl = NO_DIRECTIVES
    ) -> list[News]:
        link = await self._classrooms.get_link(classroom_id, cache)

        async def load(session: AsyncSession) -> Cached[list[News]]:
            classroom = await ClassroomRepository(session).get(link.classroom_id)
            if classroom is None or classroom.news_synced_at is None:
                return Cached(None)
            news = await NewsRepository(session).list_by_classroom(link.classroom_id)
            return Cached(
                [_to_news(item, classroom.sigaa_id) for item in news],
                classroom.news_synced_at,
                NEWS_LIST_TTL,
            )

        try:
            return await self._engine.resolve(Task.NEWS, load, link=link, cache=cache)
        except ClassroomNotFound:
            raise classroom_not_found()

    async def get_classroom_news(
        self, classroom_id: str, news_id: int, cache: CacheControl = NO_DIRECTIVES
    ) -> News:
        link = await self._classrooms.get_link(classroom_id, cache)

        async def load(session: AsyncSession) -> Cached[News]:
            item = await NewsRepository(session).get(link.classroom_id, news_id)
            if item is None or item.content_synced_at is None:
                return Cached(None)
            return Cached(
                _to_news(item, link.classroom.sigaa_id, detail=True),
                item.content_synced_at,
                NEWS_CONTENT_TTL,
            )

        try:
            return await self._engine.resolve(
                Task.NEWS_CONTENT, load, link=link, news_id=news_id, cache=cache
            )
        except ClassroomNotFound:
            raise classroom_not_found()
        except NewsNotFound:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="News not found"
            )


def _to_news(
    item: ClassroomNews, sigaa_id: int | None, *, detail: bool = False
) -> News:
    return News(
        id=item.sigaa_id,
        classroom_sigaa_id=sigaa_id,
        title=item.title,
        published_on=item.published_on,
        published_at=item.published_at if detail else None,
        content=item.content if detail else None,
        attachments=tuple(item.attachments) if detail else (),
    )


def _title(title: str) -> str:
    return " ".join(unescape(title).split())


NewsServiceDep = Annotated[NewsService, Depends()]

ClassroomNewsServiceDep = Annotated[ClassroomNewsService, Depends()]
