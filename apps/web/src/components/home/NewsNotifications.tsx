import type { Components } from 'react-markdown';

import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Bell } from 'lucide-react';
import { m } from 'motion/react';
import { useSyncExternalStore } from 'react';
import ReactMarkdown from 'react-markdown';

import type { ClassroomNews } from '#/queries/posts';

import { ErrorCard, SIGAA_DOWN_MESSAGE, StaleDataNotice } from '#/components/ErrorState';
import { LoadingText } from '#/components/LoadingText';
import { Button } from '#/components/ui/button';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '#/components/ui/popover';
import { postDateLabel } from '#/lib/classroom-posts';
import { STORAGE_KEYS, storedValue } from '#/lib/local-storage';
import { rise, useEntrance } from '#/lib/motion';
import { latestNewsQueryOptions } from '#/queries/posts';

const previewComponents: Components = { p: ({ children }) => <span>{children} </span> };

// Notícia mais recente já vista ao abrir o popover.
const seenNews = storedValue<string | null>(STORAGE_KEYS.SEEN_NEWS, null);
const newsKey = ({ classroom, post }: ClassroomNews) => `${classroom.id}:${post.id}`;

export function NewsNotifications() {
    const feed = useQuery(latestNewsQueryOptions);
    const seen = useSyncExternalStore(
        seenNews.subscribe,
        seenNews.getSnapshot,
        seenNews.getServerSnapshot
    );
    const latest = feed.data?.items[0];
    const unread = latest != null && newsKey(latest) !== seen;

    return (
        <Popover
            onOpenChange={(open) => {
                if (open && latest) seenNews.set(newsKey(latest));
            }}
        >
            <PopoverTrigger
                render={
                    <Button
                        variant="ghost"
                        size="icon-lg"
                        className="relative size-11 rounded-full"
                        aria-label={unread ? 'Notificações, há notícias novas' : 'Notificações'}
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
                <PopoverTitle className="border-b px-4 py-3">Últimas notícias</PopoverTitle>
                <div className="flex max-h-96 flex-col overflow-y-auto pb-2">
                    <NewsList />
                </div>
            </PopoverContent>
        </Popover>
    );
}

function NewsList() {
    const feed = useQuery(latestNewsQueryOptions);
    const entrance = useEntrance();

    if (feed.isPending)
        return (
            <NewsMessage>
                <LoadingText>Carregando notícias...</LoadingText>
            </NewsMessage>
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
                    <StaleDataNotice subject="as notícias" />
                </div>
            )}
            {items.length > 0 ? (
                <m.ul className="flex flex-col divide-y divide-border" {...entrance}>
                    {items.map((item, index) => (
                        <m.li key={newsKey(item)} custom={index} variants={rise}>
                            <NewsItem item={item} />
                        </m.li>
                    ))}
                </m.ul>
            ) : (
                <NewsMessage>
                    {updating ? 'Buscando notícias das turmas...' : 'Nenhuma notícia por enquanto.'}
                </NewsMessage>
            )}
        </>
    );
}

function NewsMessage({ children }: { children: React.ReactNode }) {
    return <p className="px-4 py-2 text-sm text-muted-foreground">{children}</p>;
}

function NewsItem({ item: { classroom, post } }: { item: ClassroomNews }) {
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
        </Link>
    );
}
