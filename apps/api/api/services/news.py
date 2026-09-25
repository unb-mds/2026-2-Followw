from html import unescape
from typing import Annotated

from fastapi import Depends, HTTPException, status
from sigaa_client import ClassroomNotFound, News, NewsNotFound

from api.dependencies.sigaa import SigaaClientDep


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

    async def list_classroom_news(self, classroom_id: str) -> list[News]:
        classroom_id, sigaa_id = await self._resolve(classroom_id)
        try:
            news = await self._client.classrooms.list_classroom_news(classroom_id)
        except ClassroomNotFound:
            raise _classroom_not_found()
        return [
            item.model_copy(update={"classroom_sigaa_id": sigaa_id}) for item in news
        ]

    async def get_classroom_news(self, classroom_id: str, news_id: int) -> News:
        classroom_id, sigaa_id = await self._resolve(classroom_id)
        try:
            news = await self._client.classrooms.get_classroom_news(
                classroom_id, news_id
            )
        except ClassroomNotFound:
            raise _classroom_not_found()
        except NewsNotFound:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="News not found"
            )
        return news.model_copy(update={"classroom_sigaa_id": sigaa_id})

    async def _resolve(self, classroom_id: str) -> tuple[str, int | None]:
        """`Classroom.id` e `sigaa_id` da turma; quem confere o histórico é o client."""
        current = await self._client.classrooms.list_current_classrooms()
        match = next((c for c in current if c.id == classroom_id), None) or next(
            (c for c in current if c.sigaa_id and str(c.sigaa_id) == classroom_id),
            None,
        )
        # Fora do portal, só pode ser um `Classroom.id` de semestre passado.
        return (match.id, match.sigaa_id) if match else (classroom_id, None)


def _title(title: str) -> str:
    return " ".join(unescape(title).split())


def _classroom_not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND, detail="Classroom not found"
    )


NewsServiceDep = Annotated[NewsService, Depends()]
