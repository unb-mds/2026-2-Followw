import {
    emptySubjectFilters,
    type SubjectFilterParams
} from '@followw/core/lib/subject-filters.ts';
import { useSyncExternalStore } from 'react';

// Filtros de matérias da busca, como os parâmetros da URL no web; valem enquanto o app está aberto.
let filters = emptySubjectFilters;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

export function setSubjectFilters(next: Partial<SubjectFilterParams>) {
    filters = { ...filters, ...next };
    for (const listener of listeners) listener();
}

export const clearSubjectFilters = () => setSubjectFilters(emptySubjectFilters);

export const useSubjectFilters = () => useSyncExternalStore(subscribe, () => filters);
