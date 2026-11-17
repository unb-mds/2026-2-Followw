import type { ClassroomPost, PostType } from '@followw/core/queries/classrooms.ts';

import { postDateLabel, postLink, postTypeLabels } from '@followw/core/lib/classroom-posts.ts';
import {
    classroomPostDetailQueryOptions,
    classroomPostsQueryOptions,
    classroomTeachingPlanQueryOptions
} from '@followw/core/queries/classrooms.ts';
import { noop, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { BookOpen, RefreshCw } from 'lucide-react';
import { m } from 'motion/react';
import { useState } from 'react';

import { ErrorCard, SIGAA_DOWN_MESSAGE, StaleDataNotice } from '#/components/ErrorState';
import { ListCard } from '#/components/ListCard';
import { LoadingText } from '#/components/LoadingText';
import { TabFilter } from '#/components/TabFilter';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger
} from '#/components/ui/accordion';
import { Badge } from '#/components/ui/badge';
import { Button } from '#/components/ui/button';
import { Card, CardContent } from '#/components/ui/card';
import { Markdown } from '#/lib/markdown';
import { rise, useEntrance } from '#/lib/motion';
import { cn } from '#/lib/shadcn';
import { refreshQuery } from '#/queries/refresh';

const filters = ['all', 'news', 'topic', 'material', 'assessment'] as const;
const filterLabels: Record<(typeof filters)[number], string> = {
    all: 'Todas',
    news: 'Notícias',
    topic: 'Tópicos de aula',
    material: 'Materiais',
    assessment: 'Avaliações'
};

export function ClassroomPosts({ id }: { id: string }) {
    const queryClient = useQueryClient();
    const options = classroomPostsQueryOptions(id);
    const posts = useQuery(options);
    const planOptions = classroomTeachingPlanQueryOptions(id);
    const plan = useQuery({ ...planOptions, enabled: !posts.isPending });
    const [openedId, setOpenedId] = useState<string | null>(null);
    const [type, setType] = useState<PostType | 'all'>('all');
    const entrance = useEntrance();

    const visible = (posts.data ?? []).filter((post) => type === 'all' || post.type === type);
    const topics = new Map(
        (posts.data ?? []).filter((post) => post.type === 'topic').map((post) => [post.id, post])
    );
    const refresh = useMutation({
        mutationFn: async () => {
            const openedNews = posts.data?.find(
                (post) => post.id === openedId && post.type === 'news'
            );
            await refreshQuery(queryClient, options).catch(noop);
            if (openedNews)
                await refreshQuery(
                    queryClient,
                    classroomPostDetailQueryOptions(id, openedNews.id)
                ).catch(noop);
            await refreshQuery(queryClient, planOptions).catch(noop);
        }
    });
    const refreshing = posts.isFetching || refresh.isPending;

    return (
        <section aria-label="Postagens da turma" className="flex flex-col gap-3">
            {plan.data && (
                <ListCard>
                    <Link
                        to="/turmas/$id/plano-de-ensino"
                        params={{ id }}
                        className="flex min-h-11 items-center gap-3 rounded-lg py-3 text-sm font-semibold transition-colors outline-none hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                        <BookOpen aria-hidden className="size-4 shrink-0 text-primary" />
                        Plano de ensino
                    </Link>
                </ListCard>
            )}
            <div className="flex items-center justify-between gap-2">
                <TabFilter
                    label="Filtrar postagens por tipo"
                    size="sm"
                    value={type}
                    options={filters}
                    labels={filterLabels}
                    onChange={(next) => {
                        setType(next);
                        setOpenedId(null);
                    }}
                />
                <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Atualizar"
                    disabled={refreshing}
                    onClick={() => refresh.mutate()}
                >
                    <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
                </Button>
            </div>
            {posts.isError && !posts.isLoadingError && <StaleDataNotice subject="as postagens" />}
            {posts.isPending ? (
                <PostsMessage>
                    <LoadingText>Carregando postagens...</LoadingText>
                </PostsMessage>
            ) : posts.isLoadingError ? (
                <ErrorCard message={SIGAA_DOWN_MESSAGE} onRetry={() => posts.refetch()} />
            ) : visible.length === 0 ? (
                <PostsMessage>
                    {posts.data.length === 0
                        ? 'Nenhuma postagem publicada.'
                        : 'Nenhuma postagem deste tipo.'}
                </PostsMessage>
            ) : (
                <ListCard>
                    <Accordion
                        key={type}
                        render={<m.div {...entrance} />}
                        value={openedId === null ? [] : [openedId]}
                        onValueChange={(value) =>
                            setOpenedId(typeof value[0] === 'string' ? value[0] : null)
                        }
                    >
                        {visible.map((post, index) => (
                            <AccordionItem
                                key={post.id}
                                value={post.id}
                                render={<m.div custom={index} variants={rise} />}
                            >
                                <AccordionTrigger className="gap-3 py-3 hover:no-underline">
                                    <span className="flex min-w-0 flex-1 flex-col items-start gap-2">
                                        <span className="flex flex-wrap items-center gap-2">
                                            <Badge variant="secondary">
                                                {postTypeLabels[post.type]}
                                            </Badge>
                                            {postDateLabel(post) && (
                                                <span className="text-xs font-medium text-muted-foreground tabular-nums">
                                                    {postDateLabel(post)}
                                                </span>
                                            )}
                                        </span>
                                        <span className="text-left text-sm font-semibold wrap-anywhere text-foreground">
                                            {post.title}
                                        </span>
                                        {post.topic_id && topics.has(post.topic_id) && (
                                            <span className="text-left text-xs font-normal text-muted-foreground">
                                                Tópico: {topics.get(post.topic_id)?.title}
                                            </span>
                                        )}
                                    </span>
                                </AccordionTrigger>
                                <AccordionContent className="pb-3">
                                    {openedId === post.id &&
                                        (post.type === 'news' ? (
                                            <PostDetail classroomId={id} postId={post.id} />
                                        ) : (
                                            <PostContent post={post} />
                                        ))}
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </ListCard>
            )}
        </section>
    );
}

function PostsMessage({ children }: { children: React.ReactNode }) {
    return (
        <Card size="sm">
            <CardContent className="text-center text-sm text-muted-foreground">
                {children}
            </CardContent>
        </Card>
    );
}

function PostDetail({ classroomId, postId }: { classroomId: string; postId: string }) {
    const detail = useQuery(classroomPostDetailQueryOptions(classroomId, postId));
    if (detail.isPending) return <LoadingText>Carregando postagem...</LoadingText>;
    if (detail.isLoadingError)
        return <ErrorCard message={SIGAA_DOWN_MESSAGE} onRetry={() => detail.refetch()} />;
    return (
        <>
            {detail.isError && <StaleDataNotice subject="esta postagem" className="mb-3" />}
            <PostContent post={detail.data} />
        </>
    );
}

function PostContent({ post }: { post: ClassroomPost }) {
    const url = postLink(post.url);
    const attachments = post.attachments.flatMap((attachment) => {
        const href = postLink(attachment.url);
        return href ? [{ ...attachment, url: href }] : [];
    });
    return (
        <div className="flex flex-col gap-3">
            {post.content && <Markdown>{post.content}</Markdown>}
            {post.type === 'assessment' && postDateLabel(post) && (
                <p className="text-sm text-muted-foreground">
                    Agendada para {postDateLabel(post)}.
                </p>
            )}
            {url && (
                <a
                    href={url}
                    target="_blank"
                    rel="external noopener noreferrer"
                    className="text-sm font-medium text-primary underline decoration-primary/30"
                >
                    {post.type === 'material' ? 'Acessar material' : 'Abrir link'}
                </a>
            )}
            {post.type === 'material' && !url && (
                <div className="flex flex-col gap-2">
                    <p className="text-sm text-muted-foreground">
                        Este material está disponível na página da turma no SIGAA.
                    </p>
                    <a
                        href="https://sigaa.unb.br/sigaa/"
                        target="_blank"
                        rel="external noopener noreferrer"
                        className="text-sm font-medium text-primary underline decoration-primary/30"
                    >
                        Abrir SIGAA
                    </a>
                </div>
            )}
            {attachments.length > 0 && (
                <div className="flex flex-col gap-1">
                    <p className="text-xs font-medium text-muted-foreground">Anexos</p>
                    {attachments.map((attachment) => (
                        <a
                            key={attachment.url}
                            href={attachment.url}
                            target="_blank"
                            rel="external noopener noreferrer"
                            className="text-sm font-medium text-primary underline decoration-primary/30"
                        >
                            {attachment.name}
                        </a>
                    ))}
                </div>
            )}
            {post.type === 'news' && postDateLabel(post) && (
                <p className="text-xs text-muted-foreground tabular-nums">
                    Publicada em {postDateLabel(post)}
                </p>
            )}
            {post.type === 'topic' && !post.content && (
                <p className="text-sm text-muted-foreground">
                    Nenhuma descrição publicada para este tópico.
                </p>
            )}
            {post.type === 'news' && !post.content && attachments.length === 0 && (
                <p className="text-sm text-muted-foreground">
                    Nenhum conteúdo adicional publicado.
                </p>
            )}
        </div>
    );
}
