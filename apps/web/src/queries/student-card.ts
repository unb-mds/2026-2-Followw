import { STORAGE_KEYS } from '@followw/core/lib/storage-keys.ts';
import {
    credentialsQueryOptions,
    hasValidCard,
    type RestaurantCredentials
} from '@followw/core/queries/restaurant-account.ts';
import { type QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useSyncExternalStore } from 'react';

import { localStorageRepository, STORAGE_PREFIX } from '#/lib/local-storage';

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

const CARD_STORAGE_KEY = `${STORAGE_PREFIX}${STORAGE_KEYS.STUDENT_CARD}`;

function readRawCard(): string | null {
    try {
        return typeof window === 'undefined' ? null : window.localStorage.getItem(CARD_STORAGE_KEY);
    } catch {
        return null;
    }
}

function subscribeCardStorage(notify: () => void) {
    if (typeof window === 'undefined') return () => {};
    const onStorage = (event: StorageEvent) => {
        if (event.key === null || event.key === CARD_STORAGE_KEY) notify();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
}

function readCard(raw: string | null, registration: string): SavedCard | undefined {
    if (!raw) return undefined;
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

function forgetQuery(queryClient: QueryClient, queryKey: readonly unknown[]) {
    const entry = queryClient.getQueryCache().find({ queryKey, exact: true });
    if (!entry) return false;
    const idle = entry.state.fetchStatus === 'idle';
    entry.setState({
        data: undefined,
        dataUpdatedAt: 0,
        status: 'pending',
        error: null,
        isInvalidated: false
    });
    if (idle && !entry.isDisabled()) {
        void queryClient.refetchQueries({ queryKey, exact: true, type: 'active' });
    }
    return !idle;
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
    const raw = useSyncExternalStore(subscribeCardStorage, readRawCard, () => null);
    const options = credentialsQueryOptions(registration);
    const saved = readCard(raw, registration);
    const cached = queryClient.getQueryState(options.queryKey);
    const synced = useRef('');
    const discarded = useRef('');
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
    const { data, dataUpdatedAt, fetchStatus } = query;
    useEffect(() => {
        const { queryKey } = credentialsQueryOptions(registration);
        if (data && discarded.current === `${registration}:${data.token}`) {
            discarded.current = '';
            forgetQuery(queryClient, queryKey);
            return;
        }
        if (fetchStatus === 'idle') discarded.current = '';
        const action = planSync(registration, readCard(raw, registration), data, dataUpdatedAt);
        if (action?.kind === 'restore') {
            queryClient.setQueryData(queryKey, action.card, { updatedAt: action.updatedAt });
        } else if (action?.kind === 'forget') {
            if (forgetQuery(queryClient, queryKey) && data) {
                discarded.current = `${registration}:${data.token}`;
            }
        } else if (
            action?.kind === 'save' &&
            synced.current !== `${registration}:${dataUpdatedAt}`
        ) {
            localStorageRepository.set(STORAGE_KEYS.STUDENT_CARD, action.saved);
        }
        if (action?.kind !== 'restore' && action?.kind !== 'forget' && data && dataUpdatedAt > 0) {
            synced.current = `${registration}:${dataUpdatedAt}`;
        }
    }, [queryClient, registration, raw, data, dataUpdatedAt, fetchStatus]);
    return query;
}
