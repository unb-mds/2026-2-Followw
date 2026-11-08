import type { ClassroomPost, PostType } from '@followw/core/queries/classrooms.ts';

import { postDateLabel, postLink, postTypeLabels } from '@followw/core/lib/classroom-posts.ts';
import {
    classroomPostDetailQueryOptions,
    classroomPostsQueryOptions
} from '@followw/core/queries/classrooms.ts';
import { refreshQuery } from '@followw/core/queries/refresh.ts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { ErrorCard, SIGAA_DOWN_MESSAGE, StaleDataNotice } from '@/components/ErrorState';
import { ListCard } from '@/components/ListCard';
import { LoadingText } from '@/components/LoadingText';
import { Markdown, openLink } from '@/components/Markdown';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

const filters: { type: PostType | 'all'; label: string }[] = [
    { type: 'all', label: 'Todas' },
    { type: 'news', label: 'Notícias' },
    { type: 'topic', label: 'Tópicos de aula' },
    { type: 'material', label: 'Materiais' },
    { type: 'assessment', label: 'Avaliações' }
];

export function ClassroomPosts({ id }: { id: string }) {
    const queryClient = useQueryClient();
    const options = classroomPostsQueryOptions(id);
    const posts = useQuery(options);
    const [openedId, setOpenedId] = useState<string | null>(null);
    const [type, setType] = useState<PostType | 'all'>('all');

    if (posts.isPending)
        return (
            <PostsMessage>
                <LoadingText className="py-0">Carregando postagens...</LoadingText>
            </PostsMessage>
        );
    if (posts.isLoadingError)
        return <ErrorCard message={SIGAA_DOWN_MESSAGE} onRetry={() => void posts.refetch()} />;

    const visible = posts.data.filter((post) => type === 'all' || post.type === type);
    const topics = new Map(
        posts.data.filter((post) => post.type === 'topic').map((post) => [post.id, post])
    );

    return (
        <View accessibilityLabel="Postagens da turma" className="flex-col gap-3">
            <View className="flex-row flex-wrap items-center justify-between gap-2">
                <View
                    accessibilityLabel="Filtrar postagens por tipo"
                    className="min-w-0 flex-row flex-wrap gap-1"
                >
                    {filters.map((filter) => (
                        <Button
                            key={filter.type}
                            size="sm"
                            variant={type === filter.type ? 'secondary' : 'ghost'}
                            accessibilityState={{ selected: type === filter.type }}
                            onPress={() => {
                                setType(filter.type);
                                setOpenedId(null);
                            }}
                        >
                            <Text>{filter.label}</Text>
                        </Button>
                    ))}
                </View>
                <Button
                    variant="ghost"
                    size="sm"
                    disabled={posts.isFetching}
                    onPress={() => {
                        const openedNews = posts.data.find(
                            (post) => post.id === openedId && post.type === 'news'
                        );
                        void Promise.all([
                            refreshQuery(queryClient, options),
                            ...(openedNews
                                ? [
                                      refreshQuery(
                                          queryClient,
                                          classroomPostDetailQueryOptions(id, openedNews.id)
                                      )
                                  ]
                                : [])
                        ]).catch(() => {});
                    }}
                >
                    <Icon as={RefreshCw} className="size-4" />
                    <Text>Atualizar</Text>
                </Button>
            </View>
            {posts.isError && <StaleDataNotice subject="as postagens" />}
            {visible.length === 0 ? (
                <PostsMessage>
                    <Text className="text-center text-sm text-muted-foreground">
                        {posts.data.length === 0
                            ? 'Nenhuma postagem publicada.'
                            : 'Nenhuma postagem deste tipo.'}
                    </Text>
                </PostsMessage>
            ) : (
                <ListCard>
                    <Accordion
                        type="single"
                        collapsible
                        value={openedId ?? ''}
                        onValueChange={(value?: string) => setOpenedId(value || null)}
                    >
                        {visible.map((post, index) => (
                            <AccordionItem
                                key={post.id}
                                value={post.id}
                                className={index === visible.length - 1 ? 'border-b-0' : undefined}
                            >
                                <AccordionTrigger className="gap-3 py-3">
                                    <View className="min-w-0 flex-1 flex-col items-start gap-2">
                                        <View className="flex-row flex-wrap items-center gap-2">
                                            <Badge variant="secondary">
                                                <Text>{postTypeLabels[post.type]}</Text>
                                            </Badge>
                                            {postDateLabel(post) && (
                                                <Text className="text-xs font-medium text-muted-foreground">
                                                    {postDateLabel(post)}
                                                </Text>
                                            )}
                                        </View>
                                        <Text className="text-left text-sm font-semibold text-foreground">
                                            {post.title}
                                        </Text>
                                        {post.topic_id && topics.has(post.topic_id) && (
                                            <Text className="text-left text-xs font-normal text-muted-foreground">
                                                Tópico: {topics.get(post.topic_id)?.title}
                                            </Text>
                                        )}
                                    </View>
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
        </View>
    );
}

function PostsMessage({ children }: { children: React.ReactNode }) {
    return (
        <Card size="sm">
            <CardContent>{children}</CardContent>
        </Card>
    );
}

function PostDetail({ classroomId, postId }: { classroomId: string; postId: string }) {
    const detail = useQuery(classroomPostDetailQueryOptions(classroomId, postId));
    if (detail.isPending)
        return <LoadingText className="justify-start py-0">Carregando postagem...</LoadingText>;
    if (detail.isLoadingError)
        return <ErrorCard message={SIGAA_DOWN_MESSAGE} onRetry={() => void detail.refetch()} />;
    return (
        <>
            {detail.isError && <StaleDataNotice subject="esta postagem" className="mb-3" />}
            <PostContent post={detail.data} />
        </>
    );
}

function LinkText({ url, children }: { url: string; children: string }) {
    return (
        <Text
            accessibilityRole="link"
            onPress={() => openLink(url)}
            className="text-sm font-medium text-primary underline"
        >
            {children}
        </Text>
    );
}

function PostContent({ post }: { post: ClassroomPost }) {
    const url = postLink(post.url);
    const attachments = post.attachments.flatMap((attachment) => {
        const href = postLink(attachment.url);
        return href ? [{ ...attachment, url: href }] : [];
    });
    const date = postDateLabel(post);
    return (
        <View className="flex-col gap-3">
            {post.content && <Markdown>{post.content}</Markdown>}
            {post.type === 'assessment' && date && (
                <Text className="text-sm text-muted-foreground">Agendada para {date}.</Text>
            )}
            {url && (
                <LinkText url={url}>
                    {post.type === 'material' ? 'Acessar material' : 'Abrir link'}
                </LinkText>
            )}
            {post.type === 'material' && !url && (
                <View className="flex-col gap-2">
                    <Text className="text-sm text-muted-foreground">
                        Este material está disponível na página da turma no SIGAA.
                    </Text>
                    <LinkText url="https://sigaa.unb.br/sigaa/">Abrir SIGAA</LinkText>
                </View>
            )}
            {attachments.length > 0 && (
                <View className="flex-col gap-1">
                    <Text className="text-xs font-medium text-muted-foreground">Anexos</Text>
                    {attachments.map((attachment) => (
                        <LinkText key={attachment.url} url={attachment.url}>
                            {attachment.name}
                        </LinkText>
                    ))}
                </View>
            )}
            {post.type === 'news' && date && (
                <Text className="text-xs text-muted-foreground">Publicada em {date}</Text>
            )}
            {post.type === 'topic' && !post.content && (
                <Text className="text-sm text-muted-foreground">
                    Nenhuma descrição publicada para este tópico.
                </Text>
            )}
            {post.type === 'news' && !post.content && attachments.length === 0 && (
                <Text className="text-sm text-muted-foreground">
                    Nenhum conteúdo adicional publicado.
                </Text>
            )}
        </View>
    );
}
