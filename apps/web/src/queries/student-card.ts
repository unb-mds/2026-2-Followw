import {
    credentialsQueryOptions,
    hasValidCard,
    type RestaurantCredentials
} from '@followw/core/queries/restaurant-account.ts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import { localStorageRepository, STORAGE_KEYS } from '#/lib/local-storage';

// sem `credentials`, é o marcador de que o SIGAA devolveu uma carteirinha vencida
interface SavedCard {
    registration: string;
    credentials?: RestaurantCredentials;
    updatedAt: number;
}

type SyncAction =
    | { kind: 'restore'; card: RestaurantCredentials; updatedAt: number }
    | { kind: 'forget' }
    | { kind: 'save'; saved: SavedCard };

function isCredentials(value: unknown): value is RestaurantCredentials {
    return (
        value !== null &&
        typeof value === 'object' &&
        'token' in value &&
        typeof value.token === 'string' &&
        value.token.length > 0 &&
        'valid_until' in value &&
        typeof value.valid_until === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(value.valid_until)
    );
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
    return isCredentials(saved.credentials) && hasValidCard(saved.credentials) ? saved : undefined;
}

// A cópia mais recente (cache em memória ou armazenamento local) vence.
function planSync(
    registration: string,
    stored: SavedCard | undefined,
    data: RestaurantCredentials | undefined,
    dataUpdatedAt: number
): SyncAction | undefined {
    if (stored?.credentials && (!data || stored.updatedAt > dataUpdatedAt)) {
        return { kind: 'restore', card: stored.credentials, updatedAt: stored.updatedAt };
    }
    if (stored && !stored.credentials && data && stored.updatedAt > dataUpdatedAt) {
        return { kind: 'forget' };
    }
    if (!data || dataUpdatedAt <= 0) return undefined;
    if (hasValidCard(data)) {
        return !stored || dataUpdatedAt >= stored.updatedAt
            ? {
                  kind: 'save',
                  saved: { registration, credentials: data, updatedAt: dataUpdatedAt }
              }
            : undefined;
    }
    return !stored || stored.credentials || dataUpdatedAt > stored.updatedAt
        ? { kind: 'save', saved: { registration, updatedAt: dataUpdatedAt } }
        : undefined;
}

export function useStudentCard(registration: string) {
    const queryClient = useQueryClient();
    const options = credentialsQueryOptions(registration);
    const saved = useMemo(() => readCard(registration), [registration]);
    const cached = queryClient.getQueryState(options.queryKey);
    // não busca na rede antes de o efeito aplicar a cópia local mais nova
    const behindLocal =
        saved !== undefined &&
        cached !== undefined &&
        (cached.data === undefined
            ? saved.credentials !== undefined
            : saved.updatedAt > cached.dataUpdatedAt);
    const query = useQuery({
        ...options,
        ...(behindLocal && { enabled: false }),
        initialData: saved?.credentials,
        initialDataUpdatedAt: saved?.credentials ? saved.updatedAt : undefined
    });
    const { data, dataUpdatedAt } = query;
    useEffect(() => {
        const { queryKey } = credentialsQueryOptions(registration);
        const action = planSync(registration, readCard(registration), data, dataUpdatedAt);
        if (action?.kind === 'restore') {
            queryClient.setQueryData(queryKey, action.card, { updatedAt: action.updatedAt });
        } else if (action?.kind === 'forget') {
            queryClient.getQueryCache().find({ queryKey, exact: true })?.setState({
                data: undefined,
                dataUpdatedAt: 0,
                status: 'pending',
                error: null,
                fetchStatus: 'idle',
                isInvalidated: false
            });
            // sem dado, o estado pendente não busca sozinho
            void queryClient.invalidateQueries({ queryKey, exact: true });
        } else if (action?.kind === 'save') {
            localStorageRepository.set(STORAGE_KEYS.STUDENT_CARD, action.saved);
        }
    }, [queryClient, registration, data, dataUpdatedAt]);
    return query;
}
