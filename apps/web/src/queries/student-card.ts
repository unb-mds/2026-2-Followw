import { cardIsExpired } from '@followw/core/lib/restaurant.ts';
import { nowInBrasilia } from '@followw/core/lib/schedule.ts';
import {
    credentialsQueryOptions,
    type RestaurantCredentials
} from '@followw/core/queries/restaurant-account.ts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import { localStorageRepository, STORAGE_KEYS } from '#/lib/local-storage';

interface SavedCard {
    registration: string;
    credentials?: RestaurantCredentials;
    updatedAt: number;
}

function readCard(registration: string): SavedCard | undefined {
    const saved = localStorageRepository.get<SavedCard>(STORAGE_KEYS.STUDENT_CARD);
    if (
        saved?.registration !== registration ||
        !Number.isFinite(saved.updatedAt) ||
        saved.updatedAt <= 0
    )
        return undefined;
    if (saved.credentials === undefined) return { registration, updatedAt: saved.updatedAt };
    if (
        saved.credentials !== null &&
        typeof saved.credentials === 'object' &&
        typeof saved.credentials.token === 'string' &&
        saved.credentials.token.length > 0 &&
        typeof saved.credentials.valid_until === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(saved.credentials.valid_until) &&
        !cardIsExpired(saved.credentials.valid_until, nowInBrasilia().date)
    )
        return saved;
    return undefined;
}

export function useStudentCard(registration: string) {
    const queryClient = useQueryClient();
    const options = credentialsQueryOptions(registration);
    const saved = useMemo(() => readCard(registration), [registration]);
    const cached = queryClient.getQueryState(options.queryKey);
    const hasNewerLocal = Boolean(
        saved && cached?.data !== undefined && saved.updatedAt > cached.dataUpdatedAt
    );
    const query = useQuery({
        ...options,
        ...(hasNewerLocal && { enabled: false }),
        initialData: saved?.credentials,
        initialDataUpdatedAt: saved?.credentials ? saved.updatedAt : undefined
    });
    const { data, dataUpdatedAt } = query;
    useEffect(() => {
        const key = credentialsQueryOptions(registration).queryKey;
        const stored = readCard(registration);
        if (stored?.credentials && (!data || stored.updatedAt > dataUpdatedAt)) {
            queryClient.setQueryData(key, stored.credentials, { updatedAt: stored.updatedAt });
            return;
        }
        if (stored && !stored.credentials && data && stored.updatedAt > dataUpdatedAt) {
            queryClient.getQueryCache().find({ queryKey: key, exact: true })?.setState({
                data: undefined,
                dataUpdatedAt: 0,
                status: 'pending',
                error: null,
                fetchStatus: 'idle',
                isInvalidated: false
            });
            return;
        }
        if (!data || dataUpdatedAt <= 0) return;
        if (!cardIsExpired(data.valid_until, nowInBrasilia().date)) {
            if (!stored || dataUpdatedAt >= stored.updatedAt) {
                localStorageRepository.set(STORAGE_KEYS.STUDENT_CARD, {
                    registration,
                    credentials: data,
                    updatedAt: dataUpdatedAt
                } satisfies SavedCard);
            }
            return;
        }
        if (!stored || stored.credentials || dataUpdatedAt > stored.updatedAt) {
            localStorageRepository.set(STORAGE_KEYS.STUDENT_CARD, {
                registration,
                updatedAt: dataUpdatedAt
            } satisfies SavedCard);
        }
    }, [queryClient, registration, data, dataUpdatedAt]);
    return query;
}
