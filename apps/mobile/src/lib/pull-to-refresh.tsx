import type { QueryClient } from '@tanstack/react-query';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { RefreshControl } from 'react-native';

import { useColor } from '@/lib/colors';

/** Pede dados novos à API (ex.: `(qc) => refreshQuery(qc, meQueryOptions)`); falhas ficam a cargo do QueryState. */
export type RefreshFn = (queryClient: QueryClient) => Promise<unknown>;

/** `refreshControl` para ScrollView/FlatList com pull-to-refresh. */
export function usePullToRefresh(refresh: RefreshFn | undefined, offset = 0) {
    const queryClient = useQueryClient();
    const tint = useColor('muted-foreground');
    const [refreshing, setRefreshing] = useState(false);

    const onRefresh = useCallback(async () => {
        if (!refresh) return;
        setRefreshing(true);
        try {
            await refresh(queryClient);
        } catch {
            // o erro aparece na query, que mantém o dado salvo
        } finally {
            setRefreshing(false);
        }
    }, [refresh, queryClient]);

    if (!refresh) return undefined;
    return (
        <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={tint}
            progressViewOffset={offset}
        />
    );
}
