from html import unescape
from typing import Annotated

from fastapi import Depends
from sigaa_client import News

from api.sigaa import SigaaClientDep


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


def _title(title: str) -> str:
    return " ".join(unescape(title).split())


NewsServiceDep = Annotated[NewsService, Depends()]
