from html import unescape
from typing import Annotated

from fastapi import Depends, HTTPException, status
from sigaa_client import Classroom, News, NewsNotFound

from api.dependencies.sigaa import SigaaClientDep


class NewsService:
    def __init__(self, client: SigaaClientDep) -> None:
        self._client = client

    async def list_news(self, *, resolve_ids: bool = False) -> list[News]:
        news = await self._client.profile.list_news()
        if not resolve_ids or not news:
            return news

        classrooms = await self._client.classrooms.list_classrooms()
        by_classroom: dict[int, list[News]] = {}
        for item in news:
            classroom_id = item.classroom_sigaa_id
            if classroom_id is None or classroom_id in by_classroom:
                continue
            matches = [c for c in classrooms if c.sigaa_id == classroom_id]
            if len(matches) == 1:
                by_classroom[classroom_id] = (
                    await self._client.classrooms.list_classroom_news(matches[0].id)
                )
            else:
                by_classroom[classroom_id] = []

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

    async def list_classroom_news(self, classroom_id: str) -> list[News]:
        classroom = await self._classroom(classroom_id)
        news = await self._client.classrooms.list_classroom_news(classroom.id)
        return [item.model_copy(update={"classroom_sigaa_id": classroom.sigaa_id}) for item in news]

    async def _classroom(self, classroom_id: str) -> Classroom:
        classrooms = await self._client.classrooms.list_classrooms()
        matches = [c for c in classrooms if c.id == classroom_id]
        if not matches and classroom_id.isascii() and classroom_id.isdecimal():
            matches = [c for c in classrooms if c.sigaa_id == int(classroom_id)]
        if len(matches) != 1:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Classroom not found"
            )
        return matches[0]

    async def get_classroom_news(self, classroom_id: str, news_id: int) -> News:
        classroom = await self._classroom(classroom_id)
        try:
            news = await self._client.classrooms.get_classroom_news(classroom.id, news_id)
        except NewsNotFound:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="News not found"
            )
        return news.model_copy(update={"classroom_sigaa_id": classroom.sigaa_id})


def _title(title: str) -> str:
    return " ".join(unescape(title).split())


NewsServiceDep = Annotated[NewsService, Depends()]
