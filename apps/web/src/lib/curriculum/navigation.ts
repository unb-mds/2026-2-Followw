import { SEARCH_CATEGORIES, type SearchCategory } from '#/lib/search-categories';

export interface FlowSearch {
    materia?: string;
    q?: string;
    category?: SearchCategory;
}
export function validateFlowSearch(search: Record<string, unknown>): FlowSearch {
    return {
        materia:
            typeof search.materia === 'string' && /^[a-zA-Z0-9_-]{1,32}$/.test(search.materia)
                ? search.materia
                : undefined,
        q: typeof search.q === 'string' ? search.q.slice(0, 32) : undefined,
        category: SEARCH_CATEGORIES.find((category) => category === search.category)
    };
}
export function searchDestination(search: FlowSearch) {
    return { to: '/buscar' as const, search: { q: search.q, category: search.category } };
}

declare module '@tanstack/history' {
    interface HistoryState {
        flowReturnScroll?: number;
    }
}
