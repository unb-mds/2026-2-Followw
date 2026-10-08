from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import Depends
from sigaa_client import News
from sqlalchemy.ext.asyncio import AsyncSession

from api.cache import freshness
from api.db.models import ClassroomNews, OwnLink
from api.modules.classrooms.repository import ClassroomRepository, NewsRepository
from api.modules.classrooms.service import ClassroomServiceDep
from api.sync import Cached, Context, Item, SyncDep

# Lista de notícias das turmas atuais; a de semestres passados não muda.
NEWS_LIST_TTL = timedelta(minutes=60)
# None mantém o conteúdo salvo; use timedelta para revalidá-lo periodicamente.
NEWS_CONTENT_TTL: timedelta | None = None


async def sync_news(ctx: Context[OwnLink]) -> None:
    link = ctx.target
    news = await ctx.client.classrooms.list_classroom_news(link.front_end_id)
    await ctx.sync.db.write(
        lambda session: NewsRepository(session).save_list(
            link.row.classroom_id, news, datetime.now(UTC)
        )
    )


async def sync_news_content(ctx: Context[Item]) -> None:
    link, news_id = ctx.target.link, ctx.target.id
    content = await ctx.client.classrooms.get_classroom_news(link.front_end_id, news_id)
    await ctx.sync.db.write(
        lambda session: NewsRepository(session).save_content(
            link.row.classroom_id, content, datetime.now(UTC)
        )
    )


class ClassroomNewsService:
    def __init__(self, sync: SyncDep, classrooms: ClassroomServiceDep) -> None:
        self._sync = sync
        self._classrooms = classrooms

    async def list_classroom_news(self, classroom_id: str) -> list[News]:
        link = await self._classrooms.get_link(classroom_id)

        async def load(session: AsyncSession) -> Cached[list[News]] | None:
            classroom = await ClassroomRepository(session).get(link.row.classroom_id)
            if classroom is None or classroom.news_synced_at is None:
                return None
            news = await NewsRepository(session).list_by_classroom(
                link.row.classroom_id
            )
            return Cached(
                [_to_news(item, classroom.sigaa_id) for item in news],
                classroom.news_synced_at,
                freshness(
                    classroom.news_synced_at,
                    NEWS_LIST_TTL if link.row.current else None,
                ),
            )

        return await self._sync.resolve(sync_news, link, load)

    async def get_classroom_news(self, classroom_id: str, news_id: int) -> News:
        link = await self._classrooms.get_link(classroom_id)

        async def load(session: AsyncSession) -> Cached[News] | None:
            item = await NewsRepository(session).get(link.row.classroom_id, news_id)
            if item is None or item.content_synced_at is None:
                return None
            return Cached(
                _to_news(item, link.row.classroom.sigaa_id, detail=True),
                item.content_synced_at,
                freshness(item.content_synced_at, NEWS_CONTENT_TTL),
            )

        return await self._sync.resolve(sync_news_content, Item(link, news_id), load)


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


ClassroomNewsServiceDep = Annotated[ClassroomNewsService, Depends()]
