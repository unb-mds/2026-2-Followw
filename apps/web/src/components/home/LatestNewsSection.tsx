import type { Components } from 'react-markdown';

import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';

import type { ClassroomNews } from '#/queries/posts';

import { ErrorCard, SIGAA_DOWN_MESSAGE } from '#/components/ErrorState';
import { LoadingText } from '#/components/LoadingText';
import { SectionHeader } from '#/components/SectionHeader';
import { Button } from '#/components/ui/button';
import { Card, CardContent } from '#/components/ui/card';
import { postDateLabel } from '#/lib/classroom-posts';
import { latestNewsQueryOptions } from '#/queries/posts';

const previewComponents: Components = { p: ({ children }) => <span>{children} </span> };

export function LatestNewsSection() {
    const feed = useQuery(latestNewsQueryOptions);
    const news = feed.data?.items ?? [];

    return (
        <section aria-label="Últimas notícias">
            <SectionHeader title="Últimas notícias" />
            <div className="flex flex-col gap-2">
                {feed.isPending ? (
                    <NewsMessage>
                        <LoadingText>Carregando notícias...</LoadingText>
                    </NewsMessage>
                ) : (
                    <>
                        {feed.isLoadingError ? (
                            <ErrorCard
                                message={SIGAA_DOWN_MESSAGE}
                                onRetry={() => void feed.refetch()}
                            />
                        ) : (
                            feed.isError && (
                                <output className="text-sm text-muted-foreground">
                                    Não foi possível atualizar as notícias. Exibindo os dados
                                    salvos.
                                </output>
                            )
                        )}
                        {news.length > 0 ? (
                            <NewsCarousel news={news} />
                        ) : (
                            !feed.isLoadingError && (
                                <NewsMessage>
                                    {feed.data?.updating
                                        ? 'Buscando notícias das turmas...'
                                        : 'Nenhuma notícia por enquanto.'}
                                </NewsMessage>
                            )
                        )}
                    </>
                )}
            </div>
        </section>
    );
}

function NewsMessage({ children }: { children: React.ReactNode }) {
    return (
        <Card size="sm">
            <CardContent className="text-sm text-muted-foreground">{children}</CardContent>
        </Card>
    );
}

function NewsCarousel({ news }: { news: ClassroomNews[] }) {
    const [index, setIndex] = useState(0);
    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);
    const count = news.length;
    const active = index % count;

    useEffect(() => {
        if (count < 2 || hovered || focused) return undefined;
        const timer = setInterval(() => setIndex((current) => (current + 1) % count), 5000);
        return () => clearInterval(timer);
    }, [count, hovered, focused]);

    return (
        <Card
            as="section"
            size="sm"
            className="relative isolate gap-0 overflow-clip py-0"
            aria-roledescription="carrossel"
            aria-label="Notícias recentes das turmas"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onFocusCapture={() => setFocused(true)}
            onBlurCapture={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
            }}
        >
            <div aria-live={hovered || focused ? 'polite' : 'off'} aria-atomic="true">
                <NewsContent
                    key={`${news[active].classroom.id}-${news[active].post.id}`}
                    item={news[active]}
                />
            </div>
            {count > 1 && (
                <div className="flex items-center justify-start border-t border-border bg-muted/40 px-4 py-1">
                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label="Notícia anterior"
                            onClick={() => setIndex((active + count - 1) % count)}
                        >
                            <ChevronLeft aria-hidden="true" />
                        </Button>
                        <span className="text-xs text-muted-foreground tabular-nums">
                            {active + 1} / {count}
                        </span>
                        <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label="Próxima notícia"
                            onClick={() => setIndex((active + 1) % count)}
                        >
                            <ChevronRight aria-hidden="true" />
                        </Button>
                    </div>
                </div>
            )}
        </Card>
    );
}

function NewsContent({ item: { classroom, post } }: { item: ClassroomNews }) {
    const date = postDateLabel(post);
    return (
        <div className="relative flex min-h-28 flex-col gap-2 px-4 py-3">
            <Link
                to="/turmas/$id"
                params={{ id: classroom.id }}
                search={{ tab: 'posts' }}
                aria-label={`${post.title} — ver postagens de ${classroom.subject.name}`}
                className="absolute inset-0 transition-colors hover:bg-primary/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
            />
            <div className="pointer-events-none relative flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="min-w-0 font-medium break-words text-primary">
                    {classroom.subject.name} · Turma {classroom.number}
                </span>
                {date && <span className="tabular-nums">{date}</span>}
            </div>
            <h3 className="pointer-events-none relative text-sm font-semibold wrap-anywhere">
                {post.title}
            </h3>
            <div className="pointer-events-none relative line-clamp-2 text-sm text-muted-foreground">
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
            </div>
        </div>
    );
}
