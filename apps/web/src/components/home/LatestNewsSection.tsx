import type { Components } from 'react-markdown';

import { useQueries, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';

import type { ClassroomNews } from '#/lib/latest-news';

import { ErrorCard, SIGAA_DOWN_MESSAGE } from '#/components/ErrorState';
import { LoadingText } from '#/components/LoadingText';
import { SectionHeader } from '#/components/SectionHeader';
import { Button } from '#/components/ui/button';
import { Card, CardContent } from '#/components/ui/card';
import { postDateLabel } from '#/lib/classroom-posts';
import { latestNews } from '#/lib/latest-news';
import {
    classroomPostDetailQueryOptions,
    classroomPostsQueryOptions,
    classroomsQueryOptions
} from '#/queries/classrooms';

const previewComponents: Components = { p: ({ children }) => <span>{children} </span> };

export function LatestNewsSection() {
    const classrooms = useQuery(classroomsQueryOptions);
    const current = classrooms.data?.filter((classroom) => classroom.current) ?? [];
    const lists = useQueries({
        queries: current.map((classroom) => classroomPostsQueryOptions(classroom.id, 'news'))
    });
    const loading = classrooms.isPending || lists.some((query) => query.isPending);
    const failed = classrooms.isLoadingError || lists.some((query) => query.isLoadingError);
    const stale = classrooms.isError || lists.some((query) => query.isError);
    const news = loading
        ? []
        : latestNews(
              current.map((classroom, index) => ({
                  classroom,
                  posts: lists[index].data ?? []
              }))
          );

    return (
        <section aria-label="Últimas notícias">
            <SectionHeader title="Últimas notícias" />
            <div className="flex flex-col gap-2">
                {loading ? (
                    <NewsMessage>
                        <LoadingText>Carregando notícias...</LoadingText>
                    </NewsMessage>
                ) : (
                    <>
                        {failed ? (
                            <ErrorCard
                                message={SIGAA_DOWN_MESSAGE}
                                onRetry={() => {
                                    void classrooms.refetch();
                                    for (const query of lists) void query.refetch();
                                }}
                            />
                        ) : (
                            stale && (
                                <output className="text-sm text-muted-foreground">
                                    Não foi possível atualizar as notícias. Exibindo os dados
                                    salvos.
                                </output>
                            )
                        )}
                        {news.length > 0 ? (
                            <NewsCarousel news={news} />
                        ) : (
                            !failed && <NewsMessage>Nenhuma notícia por enquanto.</NewsMessage>
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
    const [paused, setPaused] = useState(false);
    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);
    const count = news.length;
    const active = index % count;

    useEffect(() => {
        if (count < 2 || paused || hovered || focused) return undefined;
        const timer = setInterval(() => setIndex((current) => (current + 1) % count), 5000);
        return () => clearInterval(timer);
    }, [count, paused, hovered, focused]);

    return (
        <Card
            as="section"
            size="sm"
            className="gap-0 py-0"
            aria-roledescription="carrossel"
            aria-label="Notícias recentes das turmas"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onFocusCapture={() => setFocused(true)}
            onBlurCapture={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
            }}
        >
            {count > 1 && (
                <div className="flex items-center justify-start border-b border-border bg-muted/40 px-4 py-1">
                    <div className="flex items-center gap-1">
                        <span className="mr-1 text-xs text-muted-foreground tabular-nums">
                            {active + 1} / {count}
                        </span>
                        <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label="Notícia anterior"
                            onClick={() => setIndex((active + count - 1) % count)}
                        >
                            <ChevronLeft aria-hidden="true" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="xs"
                            aria-pressed={paused}
                            onClick={() => setPaused(!paused)}
                        >
                            {paused ? 'Continuar' : 'Parar'}
                        </Button>
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
            <div aria-live={paused || hovered || focused ? 'polite' : 'off'} aria-atomic="true">
                <NewsContent
                    key={`${news[active].classroom.id}-${news[active].post.id}`}
                    item={news[active]}
                />
            </div>
        </Card>
    );
}

function NewsContent({ item: { classroom, post } }: { item: ClassroomNews }) {
    const detail = useQuery(classroomPostDetailQueryOptions(classroom.id, post.id));
    const date = postDateLabel(post);
    return (
        <div className="relative flex min-h-28 flex-col gap-2 px-4 py-3">
            <Link
                to="/turmas/$id"
                params={{ id: classroom.id }}
                search={{ tab: 'posts' }}
                aria-label={`${post.title} — ver postagens de ${classroom.subject.name}`}
                className="absolute inset-0 rounded-2xl transition-colors hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-ring"
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
                {detail.data?.content ? (
                    <ReactMarkdown
                        skipHtml
                        allowedElements={['p', 'br']}
                        unwrapDisallowed
                        components={previewComponents}
                    >
                        {detail.data.content}
                    </ReactMarkdown>
                ) : detail.isPending ? (
                    <LoadingText>Carregando prévia...</LoadingText>
                ) : detail.isError ? (
                    'Prévia indisponível. Abra as postagens da turma para tentar novamente.'
                ) : (
                    'Nenhum texto adicional publicado.'
                )}
            </div>
        </div>
    );
}
