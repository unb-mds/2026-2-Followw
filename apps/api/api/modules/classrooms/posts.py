from datetime import UTC, datetime, timedelta
from functools import partial
from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sigaa_client import DashboardPost, PostType
from sqlalchemy.ext.asyncio import AsyncSession

from api.cache import Freshness, freshness
from api.db.models import ClassroomPosts, OwnLink, User
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
from api.modules.me.repository import UserRepository
from api.sync import Cached, Context, Item, SyncDep
from api.sync.engine import run_task

POSTS_LIST_TTL = timedelta(hours=24)
DASHBOARD_TTL = timedelta(hours=1)
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
            link.row.classroom_id,
            posts,
            datetime.now(UTC),
            refresh=ctx.refresh,
        )
    )


async def sync_dashboard_posts(ctx: Context[None]) -> None:
    """Lê a home e relê só as turmas atuais com notícia ou avaliação fora do cache."""
    home = await ctx.client.classrooms.list_dashboard_posts()
    user, links = await ctx.sync.db.read(partial(_current_links, ctx.sync.registration))
    if user is None:
        return
    cached = await ctx.sync.db.read(
        lambda session: PostsRepository(session).dashboard_keys(
            [link.row.classroom_id for link in links]
        )
    )
    for link in _changed_links(home, links, cached):
        await run_task(sync_posts, Context(ctx.client, ctx.sync, link, ctx.refresh))
    await ctx.sync.db.write(partial(_mark_dashboard_synced, user.id))


async def _current_links(
    registration: str, session: AsyncSession
) -> tuple[User | None, list[OwnLink]]:
    user = await UserRepository(session).get_by_registration(registration)
    if user is None:
        return None, []
    links = await ClassroomRepository(session).list_by_user_id(user.id)
    return user, [link for link in links if link.row.current]


def _changed_links(
    home: list[DashboardPost], links: list[OwnLink], cached: set[tuple]
) -> list[OwnLink]:
    by_sigaa_id = {
        link.row.classroom.sigaa_id: link
        for link in links
        if link.row.classroom.sigaa_id is not None
    }
    changed: dict[str, OwnLink] = {}
    for post in home:
        link = by_sigaa_id.get(post.classroom_sigaa_id)
        key = (post.type, post.title, post.published_on, post.starts_on)
        if link is not None and (link.row.classroom_id, *key) not in cached:
            changed[link.front_end_id] = link
    return list(changed.values())


async def _mark_dashboard_synced(user_id: UUID, session: AsyncSession) -> None:
    user = await session.get_one(User, user_id)
    user.dashboard_synced_at = datetime.now(UTC)


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
        if not links:
            return LatestNewsFeed(items=[], updating=False)
        by_id = {link.row.classroom_id: link for link in links}
        user_id = links[0].row.user_id
        curriculum = await self._classrooms.curriculum()

        async def load(
            session: AsyncSession,
        ) -> tuple[list[ClassroomNews], datetime | None]:
            posts = await PostsRepository(session).latest_news(
                by_id.keys(), LATEST_NEWS_LIMIT
            )
            read_ids = await PostReadingRepository(session).read_ids(
                user_id, [post.id for post in posts]
            )
            user = await session.get_one(User, user_id)
            items = [
                ClassroomNews(
                    classroom=to_classroom(by_id[post.classroom_id], curriculum),
                    post=_to_post(
                        post,
                        by_id[post.classroom_id].row.classroom.sigaa_id,
                        is_read=post.id in read_ids,
                        detail=True,
                    ),
                )
                for post in posts
            ]
            return items, user.dashboard_synced_at

        items, dashboard_synced_at = await self._sync.db.read(load)
        updating = (
            any(link.row.current for link in links)
            and freshness(dashboard_synced_at, DASHBOARD_TTL) is Freshness.STALE
        )
        if updating:
            self._sync.schedule(sync_dashboard_posts, None)
        return LatestNewsFeed(items=items, updating=updating)

    async def list_posts(self, classroom_id: str) -> list[ClassroomPostView]:
        link = await self._classrooms.get_link(classroom_id)

        async def load(session: AsyncSession) -> Cached[list[ClassroomPostView]] | None:
            classroom = await ClassroomRepository(session).get(link.row.classroom_id)
            if classroom is None or classroom.posts_synced_at is None:
                return None
            posts = await PostsRepository(session).list_by_classroom(
                link.row.classroom_id
            )
            read_ids = await PostReadingRepository(session).read_ids(
                link.row.user_id, [post.id for post in posts]
            )
            return Cached(
                [
                    _to_post(item, classroom.sigaa_id, is_read=item.id in read_ids)
                    for item in posts
                ],
                classroom.posts_synced_at,
                posts_freshness(link, classroom.posts_synced_at),
            )

        return await self._sync.resolve(sync_posts, link, load)

    async def get_post(self, classroom_id: str, post_id: str) -> ClassroomPostView:
        link = await self._classrooms.get_link(classroom_id)

        async def view(
            session: AsyncSession, item: ClassroomPosts
        ) -> ClassroomPostView:
            read_ids = await PostReadingRepository(session).read_ids(
                link.row.user_id, [item.id]
            )
            return _to_post(
                item,
                link.row.classroom.sigaa_id,
                is_read=item.id in read_ids,
                detail=True,
            )

        async def load_news(session: AsyncSession) -> Cached[ClassroomPostView] | None:
            item = await PostsRepository(session).get(link.row.classroom_id, post_id)
            if item is None or item.content_synced_at is None:
                return None
            return Cached(
                await view(session, item), item.content_synced_at, Freshness.FRESH
            )

        if post_id.startswith("news:"):
            news_id = int(post_id.removeprefix("news:"))
            return await self._sync.resolve(
                sync_news_content, Item(link, news_id), load_news, immutable=True
            )

        # Avaliações mudam de data e seguem a validade da lista; o resto não muda.
        assessment = post_id.startswith("assessment:")

        async def load(session: AsyncSession) -> Cached[ClassroomPostView] | None:
            classroom = await ClassroomRepository(session).get(link.row.classroom_id)
            if classroom is None or classroom.posts_synced_at is None:
                return None
            item = await PostsRepository(session).get(link.row.classroom_id, post_id)
            if item is None:
                raise HTTPException(404, "Classroom post not found")
            if assessment:
                synced_at = classroom.posts_synced_at
                status = posts_freshness(link, synced_at)
            else:
                synced_at = item.content_synced_at or classroom.posts_synced_at
                status = Freshness.FRESH
            return Cached(await view(session, item), synced_at, status)

        return await self._sync.resolve(
            sync_posts, link, load, immutable=not assessment
        )

    async def mark_read(self, classroom_id: str, post_id: str, read: bool) -> None:
        link = await self._classrooms.get_link(classroom_id)

        async def write(session: AsyncSession) -> None:
            post = await PostsRepository(session).get(link.row.classroom_id, post_id)
            if post is None:
                raise HTTPException(404, "Classroom post not found")
            repository = PostReadingRepository(session)
            if read:
                await repository.mark(link.row.user_id, post)
            else:
                await repository.unmark(link.row.user_id, post.id)

        await self._sync.db.write(write)


def _to_post(
    item: ClassroomPosts,
    classroom_sigaa_id: int | None,
    *,
    is_read: bool = False,
    detail: bool = False,
) -> ClassroomPostView:
    include_content = detail or item.type != PostType.NEWS
    return ClassroomPostView(
        is_read=is_read,
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
