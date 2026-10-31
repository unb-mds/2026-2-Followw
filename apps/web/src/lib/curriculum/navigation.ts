export interface FlowSearch {
    materia?: string;
}
export function validateFlowSearch(search: Record<string, unknown>): FlowSearch {
    return {
        materia:
            typeof search.materia === 'string' && /^[a-zA-Z0-9_-]{1,32}$/.test(search.materia)
                ? search.materia
                : undefined
    };
}
