import {
    credentialsQueryOptions,
    hasValidCard,
    type RestaurantCredentials
} from '@followw/core/queries/restaurant-account.ts';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';

import { STORAGE_KEYS, storedValue } from '@/lib/storage';

interface SavedCard {
    registration: string;
    credentials: RestaurantCredentials;
    updatedAt: number;
}

// fora do cache do Query, que some quando o app atualiza
const savedCard = storedValue<SavedCard | null>(STORAGE_KEYS.STUDENT_CARD, null);

const validSaved = (saved: SavedCard | null, registration: string) =>
    saved?.registration === registration && hasValidCard(saved.credentials) ? saved : undefined;

/** Carteirinha do RU que sobrevive sem rede e à limpeza do cache. */
export function useStudentCard(registration: string) {
    const stored = useSyncExternalStore(savedCard.subscribe, savedCard.getSnapshot);
    const saved = validSaved(stored, registration);
    const query = useQuery({
        ...credentialsQueryOptions(registration),
        initialData: saved?.credentials,
        initialDataUpdatedAt: saved?.updatedAt
    });
    const { data, dataUpdatedAt } = query;
    useEffect(() => {
        if (!data || dataUpdatedAt <= 0) return;
        const current = savedCard.getSnapshot();
        if (current?.registration === registration && current.updatedAt >= dataUpdatedAt) return;
        if (hasValidCard(data))
            savedCard.set({ registration, credentials: data, updatedAt: dataUpdatedAt });
        // o SIGAA devolveu uma carteirinha vencida: a salva também não vale mais
        else if (current) savedCard.clear();
    }, [registration, data, dataUpdatedAt]);
    return query;
}
