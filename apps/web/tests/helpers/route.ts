import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { AnyRoute } from '@tanstack/react-router';

// QueryClient sem cache que responde cada query pela chave
export function fakeQueryClient(respond: (queryKey: QueryKey) => unknown) {
    const client = {
        getQueryData: () => undefined,
        query: async ({ queryKey }: { queryKey: QueryKey }) => respond(queryKey)
    };
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- fake parcial
    return client as unknown as QueryClient;
}

type RouteFn<T> = Extract<T, (...args: never[]) => unknown>;

// chama loader, head, beforeLoad etc. só com a parte do contexto que o teste usa
export function callRoute<T>(option: T, context: object = {}): ReturnType<RouteFn<T>> {
    if (typeof option !== 'function') throw new Error('Opção da rota não é uma função');
    return option(context);
}

// o tipo de options.loader inclui um RouteLoaderFn genérico que devolve any
export function runLoader<R extends AnyRoute>(
    route: R,
    context: object
): Promise<R['types']['loaderData']> {
    return callRoute(route.options.loader, context);
}
