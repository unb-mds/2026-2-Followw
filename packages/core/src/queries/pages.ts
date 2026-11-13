import { type QueryKey, useQueries, type UseQueryOptions } from '@tanstack/react-query';
import { useState } from 'react';

export interface Page<T> {
    items: T[];
    total: number;
    page: number;
    page_size: number;
}

/** Soma à primeira página as seguintes, pedidas uma a uma por `loadMore`. */
export function useNextPages<T, E, K extends QueryKey>(
    first: Page<T>,
    pageOptions: (page: number) => UseQueryOptions<Page<T>, E, Page<T>, K>
) {
    const [count, setCount] = useState(1);
    const pages = useQueries({
        queries: Array.from({ length: count - 1 }, (_, index) => pageOptions(index + 2))
    });
    const items = [first.items, ...pages.map((page) => page.data?.items ?? [])].flat();
    const last = pages.at(-1);
    return {
        items,
        remaining: Math.max(0, first.total - items.length),
        loading: last?.isPending ?? false,
        failed: last?.isError ?? false,
        loadMore: () => (last?.isError ? void last.refetch() : setCount(count + 1))
    };
}
