import type { ClassroomNews } from '@followw/core/queries/posts.ts';

import { postDateLabel, postPreview } from '@followw/core/lib/classroom-posts.ts';
import { latestNewsQueryOptions } from '@followw/core/queries/posts.ts';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Bell } from 'lucide-react-native';
import { useState, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { ErrorCard, SIGAA_DOWN_MESSAGE, StaleDataNotice } from '@/components/ErrorState';
import { LoadingText } from '@/components/LoadingText';
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
import { STORAGE_KEYS, storedValue } from '@/lib/storage';
import { cn } from '@/lib/utils';

// notícia mais recente já vista ao abrir a lista
const seenNews = storedValue<string | null>(STORAGE_KEYS.SEEN_NEWS, null);
const newsKey = ({ classroom, post }: ClassroomNews) => `${classroom.id}:${post.id}`;

export function NewsNotifications() {
    const [open, setOpen] = useState(false);
    const feed = useQuery(latestNewsQueryOptions);
    const seen = useSyncExternalStore(seenNews.subscribe, seenNews.getSnapshot);
    const latest = feed.data?.items[0];
    const unread = latest != null && newsKey(latest) !== seen;

    return (
        <Drawer
            showSwipeHandle
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (next && latest) seenNews.set(newsKey(latest));
            }}
        >
            <DrawerTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="relative size-11 rounded-full"
                    accessibilityLabel={unread ? 'Notificações, há notícias novas' : 'Notificações'}
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
                    <DrawerTitle>Últimas notícias</DrawerTitle>
                </DrawerHeader>
                <ScrollView className="max-h-96" contentContainerClassName="pb-2">
                    <NewsList onOpen={() => setOpen(false)} />
                </ScrollView>
            </DrawerContent>
        </Drawer>
    );
}

function NewsList({ onOpen }: { onOpen: () => void }) {
    const feed = useQuery(latestNewsQueryOptions);

    if (feed.isPending)
        return (
            <NewsMessage>
                <LoadingText className="justify-start py-0">Carregando notícias...</LoadingText>
            </NewsMessage>
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
                    <StaleDataNotice subject="as notícias" />
                </View>
            )}
            {items.length > 0 ? (
                items.map((item, index) => (
                    <NewsItem key={newsKey(item)} item={item} first={index === 0} onOpen={onOpen} />
                ))
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
    return <View className="px-4 py-2">{children}</View>;
}

function NewsItem({
    item: { classroom, post },
    first,
    onOpen
}: {
    item: ClassroomNews;
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
            <Text numberOfLines={2} className="text-sm text-muted-foreground">
                {post.content?.trim() ? postPreview(post.content) : 'Toque para ler mais.'}
            </Text>
        </Pressable>
    );
}
