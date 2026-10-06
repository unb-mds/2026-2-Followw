from collections.abc import Sequence
from datetime import datetime
from uuid import UUID

from sigaa_client import News
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.models import Classroom, ClassroomNews


class NewsRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_by_classroom(self, classroom_id: UUID) -> list[ClassroomNews]:
        return list(
            await self._session.scalars(
                select(ClassroomNews)
                .where(ClassroomNews.classroom_id == classroom_id)
                .order_by(
                    ClassroomNews.published_on.desc(), ClassroomNews.sigaa_id.desc()
                )
            )
        )

    async def get(self, classroom_id: UUID, news_id: int) -> ClassroomNews | None:
        return await self._session.scalar(
            select(ClassroomNews).where(
                ClassroomNews.classroom_id == classroom_id,
                ClassroomNews.sigaa_id == news_id,
            )
        )

    async def save_list(
        self, classroom_id: UUID, news: Sequence[News], synced_at: datetime
    ) -> None:
        existing = {
            item.sigaa_id: item for item in await self.list_by_classroom(classroom_id)
        }
        for item in news:
            assert item.id is not None
            cached = existing.get(item.id)
            if cached is None:
                cached = ClassroomNews(classroom_id=classroom_id, sigaa_id=item.id)
                self._session.add(cached)
                existing[item.id] = cached
            cached.title = item.title
            cached.published_on = item.published_on
        # A lista pode estar vazia; notícias antigas e seus conteúdos são preservados.
        classroom = await self._session.get_one(Classroom, classroom_id)
        classroom.news_synced_at = synced_at
        await self._session.flush()

    async def save_content(
        self, classroom_id: UUID, news: News, synced_at: datetime
    ) -> None:
        assert news.id is not None
        cached = await self.get(classroom_id, news.id)
        if cached is None:
            cached = ClassroomNews(classroom_id=classroom_id, sigaa_id=news.id)
            self._session.add(cached)
        cached.title = news.title
        cached.published_on = news.published_on
        cached.published_at = news.published_at
        cached.content = news.content
        cached.attachments = [
            attachment.model_dump(mode="json") for attachment in news.attachments
        ]
        cached.content_synced_at = synced_at
        await self._session.flush()
