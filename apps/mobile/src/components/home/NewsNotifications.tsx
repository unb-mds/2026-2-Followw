import type { FeedPost } from '@followw/core/queries/posts.ts';

import { postDateLabel, postPreview } from '@followw/core/lib/classroom-posts.ts';
import { STORAGE_KEYS } from '@followw/core/lib/storage-keys.ts';
import { latestPostsQueryOptions } from '@followw/core/queries/posts.ts';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Bell } from 'lucide-react-native';
import { useState, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { ErrorCard, SIGAA_DOWN_MESSAGE, StaleDataNotice } from '@/components/ErrorState';
import { LinesSkeleton, LoadingSkeleton, repeat } from '@/components/LoadingSkeleton';
import { Button } from '@/components/ui/button';
import {
    Drawer,
    DrawerContent,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger
} from '@/components/ui/drawer';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Rise } from '@/lib/motion';
import { storedValue } from '@/lib/storage';
import { cn } from '@/lib/utils';

// chaves das notificações vistas ao abrir a lista, separadas por vírgula
const seenNews = storedValue<string | null>(STORAGE_KEYS.SEEN_NEWS, null);
const postKey = ({ classroom, post }: FeedPost) => `${classroom.id}:${post.id}`;

export function NewsNotifications() {
    const [open, setOpen] = useState(false);
    const feed = useQuery(latestPostsQueryOptions);
    const seen = useSyncExternalStore(seenNews.subscribe, seenNews.getSnapshot);
    const items = feed.data?.items ?? [];
    const seenKeys = new Set(seen?.split(','));
    const unread = items.some((item) => !seenKeys.has(postKey(item)));

    return (
        <Drawer
            showSwipeHandle
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (next && items.length > 0) seenNews.set(items.map(postKey).join(','));
            }}
        >
            <DrawerTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="relative size-11 rounded-full"
                    accessibilityLabel={unread ? 'Notificações, há novidades' : 'Notificações'}
                >
                    <Icon as={Bell} className="size-5" />
                    {unread && (
                        <View
                            testID="unread-dot"
                            className="absolute top-2.5 right-2.5 size-2 rounded-full border-2 border-background bg-primary"
                        />
                    )}
                </Button>
            </DrawerTrigger>
            <DrawerContent className="mx-auto max-w-lg">
                <DrawerHeader className="border-b border-border">
                    <DrawerTitle>Notificações</DrawerTitle>
                </DrawerHeader>
                <ScrollView className="max-h-96" contentContainerClassName="pb-2">
                    <NewsList onOpen={() => setOpen(false)} />
                </ScrollView>
            </DrawerContent>
        </Drawer>
    );
}

function NewsList({ onOpen }: { onOpen: () => void }) {
    const feed = useQuery(latestPostsQueryOptions);

    if (feed.isPending)
        return (
            <LoadingSkeleton label="Carregando notificações..." className="gap-0">
                {repeat(4, (index) => (
                    <LinesSkeleton
                        lines={['h-3 w-1/2', 'w-3/4', 'w-full']}
                        className={cn('px-4 py-3', index > 0 && 'border-t border-border')}
                    />
                ))}
            </LoadingSkeleton>
        );
    if (feed.isLoadingError)
        return (
            <View className="px-2">
                <ErrorCard message={SIGAA_DOWN_MESSAGE} onRetry={() => void feed.refetch()} />
            </View>
        );

    const { items, updating } = feed.data;
    return (
        <>
            {feed.isError && (
                <View className="px-2">
                    <StaleDataNotice subject="as notificações" />
                </View>
            )}
            {items.length > 0 ? (
                items.map((item, index) => (
                    <Rise key={postKey(item)} index={index}>
                        <NewsItem item={item} first={index === 0} onOpen={onOpen} />
                    </Rise>
                ))
            ) : (
                <NewsMessage>
                    <Text className="text-sm text-muted-foreground">
                        {updating
                            ? 'Buscando novidades das turmas...'
                            : 'Nenhuma notificação por enquanto.'}
                    </Text>
                </NewsMessage>
            )}
        </>
    );
}

function NewsMessage({ children }: { children: React.ReactNode }) {
    return <View className="px-4 py-2">{children}</View>;
}

function NewsItem({
    item: { classroom, post },
    first,
    onOpen
}: {
    item: FeedPost;
    first: boolean;
    onOpen: () => void;
}) {
    const router = useRouter();
    const date = postDateLabel(post);
    return (
        <Pressable
            accessibilityRole="link"
            accessibilityLabel={`${post.title} — ver postagens de ${classroom.subject.name}`}
            onPress={() => {
                onOpen();
                router.push({
                    pathname: '/turmas/[id]',
                    params: { id: classroom.id, tab: 'posts' }
                });
            }}
            className={cn(
                'gap-1 px-4 py-3 active:bg-primary/5',
                !first && 'border-t border-border'
            )}
        >
            <View className="flex-row items-baseline justify-between gap-3">
                <Text numberOfLines={1} className="min-w-0 shrink text-xs font-medium text-primary">
                    {classroom.subject.name}
                </Text>
                {date && <Text className="shrink-0 text-xs text-muted-foreground">{date}</Text>}
            </View>
            <Text numberOfLines={2} className="text-sm font-semibold">
                {post.title}
            </Text>
            {post.type === 'assessment' ? (
                <Text className="text-sm text-muted-foreground">Avaliação</Text>
            ) : (
                <Text numberOfLines={2} className="text-sm text-muted-foreground">
                    {post.content?.trim() ? postPreview(post.content) : 'Toque para ler mais.'}
                </Text>
            )}
        </Pressable>
    );
}
