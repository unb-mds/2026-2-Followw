import type { QueryKey, UseQueryOptions } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { type Page, useNextPages } from '@followw/core/queries/pages.ts';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

const PREVIEW_SIZE = 5;

/** Lista paginada pela API; com `onShowAll`, só uma prévia que leva à aba da categoria. */
export function PagedSection<T, E, K extends QueryKey>({
    title,
    count,
    noun,
    first,
    pageOptions,
    onShowAll,
    children
}: {
    title: string;
    count: string;
    noun: string;
    first: Page<T>;
    pageOptions: (page: number) => UseQueryOptions<Page<T>, E, Page<T>, K>;
    onShowAll?: () => void;
    children: (items: T[]) => ReactNode;
}) {
    const pages = useNextPages(first, pageOptions);
    if (first.items.length === 0) return null;

    return (
        <View accessibilityLabel={title} className="gap-3">
            <View className="flex-row items-baseline justify-between gap-3">
                <Text role="heading" aria-level={2} className="text-base font-bold">
                    {title}
                </Text>
                <Text className="shrink-0 text-xs text-muted-foreground">{count}</Text>
            </View>
            {children(onShowAll ? first.items.slice(0, PREVIEW_SIZE) : pages.items)}
            {pages.failed && (
                <Text className="text-center text-xs text-destructive">{`Não foi possível carregar mais ${noun}.`}</Text>
            )}
            {onShowAll
                ? first.total > PREVIEW_SIZE && (
                      <Button
                          variant="outline"
                          size="sm"
                          onPress={onShowAll}
                          className="self-center"
                      >
                          <Text className="text-xs">{`Ver todos os ${noun} (${first.total})`}</Text>
                      </Button>
                  )
                : pages.remaining > 0 && (
                      <Button
                          variant="outline"
                          size="sm"
                          disabled={pages.loading}
                          onPress={pages.loadMore}
                          className="self-center"
                      >
                          <Text className="text-xs">
                              {pages.loading
                                  ? 'Carregando...'
                                  : `Ver mais ${noun} (${pages.remaining} restantes)`}
                          </Text>
                      </Button>
                  )}
        </View>
    );
}
