from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import Depends, HTTPException
from sigaa_client import ClassroomPost, PostType
from sqlalchemy.ext.asyncio import AsyncSession

from api.cache import freshness
from api.db.models import ClassroomPosts, OwnLink
from api.modules.classrooms.repository import ClassroomRepository, PostsRepository
from api.modules.classrooms.service import ClassroomServiceDep
from api.sync import Cached, Context, Item, SyncDep

POSTS_LIST_TTL = timedelta(minutes=60)
NEWS_CONTENT_TTL: timedelta | None = None


async def sync_posts(ctx: Context[OwnLink]) -> None:
    link = ctx.target
    posts = await ctx.client.classrooms.list_classroom_posts(link.front_end_id)
    await ctx.sync.db.write(
        lambda session: PostsRepository(session).save_list(
            link.row.classroom_id, posts, datetime.now(UTC)
        )
    )


async def sync_news_content(ctx: Context[Item]) -> None:
    link, news_id = ctx.target.link, ctx.target.id
    content = await ctx.client.classrooms.get_classroom_news(link.front_end_id, news_id)
    await ctx.sync.db.write(
        lambda session: PostsRepository(session).save_content(
            link.row.classroom_id, content, datetime.now(UTC)
        )
    )


class ClassroomPostsService:
    def __init__(self, sync: SyncDep, classrooms: ClassroomServiceDep) -> None:
        self._sync = sync
        self._classrooms = classrooms

    async def list_posts(self, classroom_id: str) -> list[ClassroomPost]:
        link = await self._classrooms.get_link(classroom_id)

        async def load(session: AsyncSession) -> Cached[list[ClassroomPost]] | None:
            classroom = await ClassroomRepository(session).get(link.row.classroom_id)
            if classroom is None or classroom.posts_synced_at is None:
                return None
            posts = await PostsRepository(session).list_by_classroom(
                link.row.classroom_id
            )
            return Cached(
                [_to_post(item, classroom.sigaa_id) for item in posts],
                classroom.posts_synced_at,
                freshness(
                    classroom.posts_synced_at,
                    POSTS_LIST_TTL if link.row.current else None,
                ),
            )

        return await self._sync.resolve(sync_posts, link, load)

    async def get_post(self, classroom_id: str, post_id: str) -> ClassroomPost:
        if not post_id.startswith("news:"):
            posts = await self.list_posts(classroom_id)
            post = next((post for post in posts if post.id == post_id), None)
            if post is None:
                raise HTTPException(404, "Classroom post not found")
            return post
        link = await self._classrooms.get_link(classroom_id)
        news_id = int(post_id.removeprefix("news:"))

        async def load(session: AsyncSession) -> Cached[ClassroomPost] | None:
            item = await PostsRepository(session).get(link.row.classroom_id, post_id)
            if item is None or item.content_synced_at is None:
                return None
            return Cached(
                _to_post(item, link.row.classroom.sigaa_id, detail=True),
                item.content_synced_at,
                freshness(item.content_synced_at, NEWS_CONTENT_TTL),
            )

        return await self._sync.resolve(sync_news_content, Item(link, news_id), load)


def _to_post(
    item: ClassroomPosts, classroom_sigaa_id: int | None, *, detail: bool = False
) -> ClassroomPost:
    include_content = detail or item.type != PostType.NEWS
    return ClassroomPost(
        id=item.source_id,
        type=item.type,
        sigaa_id=item.sigaa_id,
        classroom_sigaa_id=classroom_sigaa_id,
        topic_id=item.topic_id,
        title=item.title,
        published_on=item.published_on,
        published_at=item.published_at if include_content else None,
        content=item.content if include_content else None,
        starts_on=item.starts_on,
        ends_on=item.ends_on,
        starts_at=item.starts_at,
        time_label=item.time_label,
        url=item.url,
        attachments=tuple(item.attachments) if include_content else (),
    )


ClassroomPostsServiceDep = Annotated[ClassroomPostsService, Depends()]
