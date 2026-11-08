import type { ClassroomNews } from '@followw/core/queries/posts.ts';

import { postDateLabel, postPreview } from '@followw/core/lib/classroom-posts.ts';
import { latestNewsQueryOptions } from '@followw/core/queries/posts.ts';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, FlatList, Pressable, View } from 'react-native';

import { ErrorCard, SIGAA_DOWN_MESSAGE, StaleDataNotice } from '@/components/ErrorState';
import { LoadingText } from '@/components/LoadingText';
import { SectionHeader } from '@/components/SectionHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

export function LatestNewsSection() {
    return (
        <View accessibilityLabel="Últimas notícias">
            <SectionHeader title="Últimas notícias" />
            <View className="flex-col gap-2">
                <LatestNews />
            </View>
        </View>
    );
}

function LatestNews() {
    const feed = useQuery(latestNewsQueryOptions);

    if (feed.isPending)
        return (
            <NewsMessage>
                <LoadingText className="justify-start py-0">Carregando notícias...</LoadingText>
            </NewsMessage>
        );
    if (feed.isLoadingError)
        return <ErrorCard message={SIGAA_DOWN_MESSAGE} onRetry={() => void feed.refetch()} />;

    const { items, updating } = feed.data;
    return (
        <>
            {feed.isError && <StaleDataNotice subject="as notícias" />}
            {items.length > 0 ? (
                <NewsCarousel news={items} />
            ) : (
                <NewsMessage>
                    <Text className="text-sm text-muted-foreground">
                        {updating
                            ? 'Buscando notícias das turmas...'
                            : 'Nenhuma notícia por enquanto.'}
                    </Text>
                </NewsMessage>
            )}
        </>
    );
}

function NewsMessage({ children }: { children: React.ReactNode }) {
    return (
        <Card size="sm">
            <CardContent>{children}</CardContent>
        </Card>
    );
}

function NewsCarousel({ news }: { news: ClassroomNews[] }) {
    const list = useRef<FlatList<ClassroomNews>>(null);
    const [width, setWidth] = useState(0);
    const [index, setIndex] = useState(0);
    const [touched, setTouched] = useState(false);
    const count = news.length;
    const active = Math.min(index, count - 1);

    const goTo = (target: number) => {
        const next = (target + count) % count;
        setIndex(next);
        list.current?.scrollToOffset({ offset: next * width, animated: true });
    };

    useEffect(() => {
        if (count < 2 || touched || !width) return undefined;
        const timer = setInterval(() => {
            setIndex((current) => {
                const next = (current + 1) % count;
                list.current?.scrollToOffset({ offset: next * width, animated: true });
                return next;
            });
        }, 5000);
        return () => clearInterval(timer);
    }, [count, touched, width]);

    return (
        <Card
            size="sm"
            className="gap-0 overflow-hidden py-0"
            accessibilityLabel="Notícias recentes das turmas"
            onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
        >
            {width > 0 && (
                <FlatList
                    ref={list}
                    data={news}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    keyExtractor={(item) => `${item.classroom.id}-${item.post.id}`}
                    getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
                    onScrollBeginDrag={() => setTouched(true)}
                    onMomentumScrollEnd={(event) =>
                        setIndex(Math.round(event.nativeEvent.contentOffset.x / width))
                    }
                    renderItem={({ item }) => <NewsContent item={item} width={width} />}
                />
            )}
            {count > 1 && (
                <View className="flex-row items-center justify-end border-t border-border bg-muted/40 px-4 py-1">
                    <View className="flex-row items-center gap-1">
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Notícia anterior"
                            onPress={() => {
                                setTouched(true);
                                goTo(active - 1);
                            }}
                        >
                            <Icon as={ChevronLeft} className="size-4" />
                        </Button>
                        <Text className="text-xs text-muted-foreground">
                            {active + 1} / {count}
                        </Text>
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Próxima notícia"
                            onPress={() => {
                                setTouched(true);
                                goTo(active + 1);
                            }}
                        >
                            <Icon as={ChevronRight} className="size-4" />
                        </Button>
                    </View>
                </View>
            )}
        </Card>
    );
}

function NewsContent({ item: { classroom, post }, width }: { item: ClassroomNews; width: number }) {
    const router = useRouter();
    const date = postDateLabel(post);
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${post.title} — ver postagens de ${classroom.subject.name}`}
            onPress={() =>
                router.push({
                    pathname: '/turmas/[id]',
                    params: { id: classroom.id, tab: 'posts' }
                })
            }
            style={{ width }}
            className="h-32 flex-col gap-2 overflow-hidden px-4 py-3 active:bg-primary/5"
        >
            <View className="flex-row items-baseline justify-between gap-3">
                <Text numberOfLines={1} className="min-w-0 flex-1 text-xs font-medium text-primary">
                    {classroom.subject.name}
                </Text>
                {date && <Text className="shrink-0 text-xs text-muted-foreground">{date}</Text>}
            </View>
            <Text role="heading" aria-level={3} numberOfLines={1} className="text-sm font-semibold">
                {post.title}
            </Text>
            <Text numberOfLines={2} className="text-sm text-muted-foreground">
                {postPreview(post.content)}
            </Text>
        </Pressable>
    );
}
