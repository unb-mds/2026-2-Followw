from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sigaa_client import PostType
from sqlalchemy.ext.asyncio import AsyncSession

from api.cache import Freshness, freshness
from api.db.models import ClassroomPosts, OwnLink
from api.modules.classrooms.post_reading import (
    ClassroomPostView,
    PostReadingRepository,
)
from api.modules.classrooms.repository import ClassroomRepository, PostsRepository
from api.modules.classrooms.service import (
    ClassroomServiceDep,
    ParticipantClassroom,
    to_classroom,
)
from api.sync import Cached, Context, Item, SyncDep

POSTS_LIST_TTL = timedelta(minutes=60)
NEWS_CONTENT_TTL = timedelta(hours=1)
LATEST_NEWS_LIMIT = 5


def posts_freshness(link: OwnLink, synced_at: datetime | None) -> Freshness:
    # Listas históricas não vencem.
    return freshness(synced_at, POSTS_LIST_TTL if link.row.current else None)


class ClassroomNews(BaseModel):
    model_config = ConfigDict(frozen=True)

    classroom: ParticipantClassroom
    post: ClassroomPostView


class LatestNewsFeed(BaseModel):
    items: list[ClassroomNews]
    updating: bool


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

    async def latest_news(self) -> LatestNewsFeed:
        """O conteúdo de cada notícia segue sob demanda, por `get_post`."""
        links = await self._classrooms.list_links()
        by_id = {link.row.classroom_id: link for link in links}

        async def load(session: AsyncSession) -> list[ClassroomNews]:
            posts = await PostsRepository(session).latest_news(
                by_id.keys(), LATEST_NEWS_LIMIT
            )
            versions = (
                await PostReadingRepository(session).versions(
                    links[0].row.user_id, [post.id for post in posts]
                )
                if links
                else {}
            )
            return [
                ClassroomNews(
                    classroom=to_classroom(by_id[post.classroom_id]),
                    post=_to_post(
                        post,
                        by_id[post.classroom_id].row.classroom.sigaa_id,
                        read_version=versions.get(post.id),
                        detail=True,
                    ),
                )
                for post in posts
            ]

        items = await self._sync.db.read(load)
        stale = [
            link
            for link in links
            if posts_freshness(link, link.row.classroom.posts_synced_at)
            is Freshness.STALE
        ]
        for link in stale:
            self._sync.schedule(sync_posts, link)
        return LatestNewsFeed(
            items=items,
            updating=bool(stale),
        )

    async def list_posts(self, classroom_id: str) -> list[ClassroomPostView]:
        link = await self._classrooms.get_link(classroom_id)

        async def load(session: AsyncSession) -> Cached[list[ClassroomPostView]] | None:
            classroom = await ClassroomRepository(session).get(link.row.classroom_id)
            if classroom is None or classroom.posts_synced_at is None:
                return None
            posts = await PostsRepository(session).list_by_classroom(
                link.row.classroom_id
            )
            versions = await PostReadingRepository(session).versions(
                link.row.user_id, [post.id for post in posts]
            )
            return Cached(
                [
                    _to_post(
                        item, classroom.sigaa_id, read_version=versions.get(item.id)
                    )
                    for item in posts
                ],
                classroom.posts_synced_at,
                posts_freshness(link, classroom.posts_synced_at),
            )

        return await self._sync.resolve(sync_posts, link, load)

    async def get_post(self, classroom_id: str, post_id: str) -> ClassroomPostView:
        if not post_id.startswith("news:"):
            posts = await self.list_posts(classroom_id)
            post = next((post for post in posts if post.id == post_id), None)
            if post is None:
                raise HTTPException(404, "Classroom post not found")
            return post
        link = await self._classrooms.get_link(classroom_id)
        news_id = int(post_id.removeprefix("news:"))

        async def load(session: AsyncSession) -> Cached[ClassroomPostView] | None:
            item = await PostsRepository(session).get(link.row.classroom_id, post_id)
            if item is None or item.content_synced_at is None:
                return None
            versions = await PostReadingRepository(session).versions(
                link.row.user_id, [item.id]
            )
            return Cached(
                _to_post(
                    item,
                    link.row.classroom.sigaa_id,
                    read_version=versions.get(item.id),
                    detail=True,
                ),
                item.content_synced_at,
                freshness(
                    item.content_synced_at,
                    NEWS_CONTENT_TTL if link.row.current else None,
                ),
            )

        return await self._sync.resolve(sync_news_content, Item(link, news_id), load)

    async def mark_read(
        self, classroom_id: str, post_id: str, version: UUID | None
    ) -> None:
        link = await self._classrooms.get_link(classroom_id)

        async def write(session: AsyncSession) -> None:
            post = await PostsRepository(session).get(
                link.row.classroom_id, post_id, for_update=True
            )
            if post is None:
                raise HTTPException(404, "Classroom post not found")
            repository = PostReadingRepository(session)
            if version is None:
                await repository.unmark(link.row.user_id, post.id)
            else:
                if post.content_synced_at is None:
                    raise HTTPException(
                        409, "Load the complete post before marking it read"
                    )
                if post.version != version:
                    raise HTTPException(409, "Post has changed; fetch it again")
                await repository.mark(link.row.user_id, post)

        await self._sync.db.write(write)


def _to_post(
    item: ClassroomPosts,
    classroom_sigaa_id: int | None,
    *,
    read_version: UUID | None = None,
    detail: bool = False,
) -> ClassroomPostView:
    include_content = detail or item.type != PostType.NEWS
    return ClassroomPostView(
        version=item.version if item.content_synced_at is not None else None,
        is_read=read_version is not None and read_version == item.version,
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
