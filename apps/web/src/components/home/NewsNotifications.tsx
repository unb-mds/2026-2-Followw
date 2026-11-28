import type { FeedPost } from '@followw/core/queries/posts.ts';
import type { Components } from 'react-markdown';

import { postDateLabel } from '@followw/core/lib/classroom-posts.ts';
import { STORAGE_KEYS } from '@followw/core/lib/storage-keys.ts';
import { latestPostsQueryOptions } from '@followw/core/queries/posts.ts';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Bell } from 'lucide-react';
import { m } from 'motion/react';
import { useSyncExternalStore } from 'react';
import ReactMarkdown from 'react-markdown';

import { ErrorCard, SIGAA_DOWN_MESSAGE, StaleDataNotice } from '#/components/ErrorState';
import { LinesSkeleton, LoadingSkeleton } from '#/components/LoadingSkeleton';
import { Button } from '#/components/ui/button';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '#/components/ui/popover';
import { storedValue } from '#/lib/local-storage';
import { rise, useEntrance } from '#/lib/motion';
import { repeat } from '#/lib/repeat';

const previewComponents: Components = {
    p: ({ children }) => <span>{children} </span>
};

// Chaves das notificações vistas ao abrir o popover, separadas por vírgula.
const seenNews = storedValue<string | null>(STORAGE_KEYS.SEEN_NEWS, null);
const postKey = ({ classroom, post }: FeedPost) => `${classroom.id}:${post.id}`;

export function NewsNotifications() {
    const feed = useQuery(latestPostsQueryOptions);
    const seen = useSyncExternalStore(
        seenNews.subscribe,
        seenNews.getSnapshot,
        seenNews.getServerSnapshot
    );
    const items = feed.data?.items ?? [];
    const seenKeys = new Set(seen?.split(','));
    const unread = items.some((item) => !seenKeys.has(postKey(item)));

    return (
        <Popover
            onOpenChange={(open) => {
                if (open && items.length > 0) seenNews.set(items.map(postKey).join(','));
            }}
        >
            <PopoverTrigger
                render={
                    <Button
                        variant="ghost"
                        size="icon-lg"
                        className="relative size-11 rounded-full"
                        aria-label={unread ? 'Notificações, há novidades' : 'Notificações'}
                    />
                }
            >
                <Bell className="size-5" aria-hidden="true" />
                {unread && (
                    <span
                        data-testid="unread-dot"
                        className="absolute top-2.5 right-2.5 size-2 rounded-full bg-primary ring-2 ring-background"
                    />
                )}
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 gap-2 p-0 lg:w-96">
                <PopoverTitle className="border-b px-4 py-3">Notificações</PopoverTitle>
                <div className="flex max-h-96 flex-col overflow-y-auto pb-2">
                    <NewsList />
                </div>
            </PopoverContent>
        </Popover>
    );
}

function NewsList() {
    const feed = useQuery(latestPostsQueryOptions);
    const entrance = useEntrance();

    if (feed.isPending)
        return (
            <LoadingSkeleton
                label="Carregando notificações..."
                className="gap-0 divide-y divide-border"
            >
                {repeat(4, () => (
                    <LinesSkeleton lines={['h-3 w-1/2', 'w-3/4', 'w-full']} className="px-4 py-3" />
                ))}
            </LoadingSkeleton>
        );
    if (feed.isLoadingError)
        return (
            <div className="px-2">
                <ErrorCard message={SIGAA_DOWN_MESSAGE} onRetry={() => void feed.refetch()} />
            </div>
        );

    const { items, updating } = feed.data;
    return (
        <>
            {feed.isError && (
                <div className="px-2">
                    <StaleDataNotice subject="as notificações" />
                </div>
            )}
            {items.length > 0 ? (
                <m.ul className="flex flex-col divide-y divide-border" {...entrance}>
                    {items.map((item, index) => (
                        <m.li key={postKey(item)} custom={index} variants={rise}>
                            <NewsItem item={item} />
                        </m.li>
                    ))}
                </m.ul>
            ) : (
                <NewsMessage>
                    {updating
                        ? 'Buscando novidades das turmas...'
                        : 'Nenhuma notificação por enquanto.'}
                </NewsMessage>
            )}
        </>
    );
}

function NewsMessage({ children }: { children: React.ReactNode }) {
    return <p className="px-4 py-2 text-sm text-muted-foreground">{children}</p>;
}

function NewsItem({ item: { classroom, post } }: { item: FeedPost }) {
    const date = postDateLabel(post);
    return (
        <Link
            to="/turmas/$id"
            params={{ id: classroom.id }}
            search={{ tab: 'posts' }}
            aria-label={`${post.title} — ver postagens de ${classroom.subject.name}`}
            className="flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-primary/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        >
            <span className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
                <span className="min-w-0 truncate font-medium text-primary">
                    {classroom.subject.name}
                </span>
                {date && <span className="shrink-0 tabular-nums">{date}</span>}
            </span>
            <span className="line-clamp-2 text-sm font-semibold wrap-anywhere">{post.title}</span>
            {post.type === 'assessment' ? (
                <span className="text-sm text-muted-foreground">Avaliação</span>
            ) : (
                <span className="line-clamp-2 text-sm text-muted-foreground">
                    {post.content?.trim() ? (
                        <ReactMarkdown
                            skipHtml
                            allowedElements={['p', 'br']}
                            unwrapDisallowed
                            components={previewComponents}
                        >
                            {post.content}
                        </ReactMarkdown>
                    ) : (
                        'Clique para ler mais.'
                    )}
                </span>
            )}
        </Link>
    );
}
