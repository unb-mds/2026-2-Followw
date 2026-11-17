import type { QueryClient, QueryFunction, QueryKey } from '@tanstack/react-query';

const pending = new WeakMap<QueryClient, Promise<unknown>>();

/** A navegação JSF compartilha formulários na sessão; a fila pertence ao cliente da sessão. */
export function serialQuery<T, K extends QueryKey>(
    queryFn: QueryFunction<T, K>
): QueryFunction<T, K> {
    return (context) => {
        const signal = context.signal;
        const previous = pending.get(context.client) ?? Promise.resolve();
        const next = previous
            .catch(() => {})
            .then(() => {
                signal.throwIfAborted();
                // O servidor pode continuar no SIGAA mesmo se o navegador abortar o HTTP.
                return queryFn({ ...context, signal: new AbortController().signal });
            });
        pending.set(context.client, next);
        return next.finally(() => {
            if (pending.get(context.client) === next) pending.delete(context.client);
        });
    };
}
