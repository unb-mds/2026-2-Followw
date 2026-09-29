import type { QueryClient, QueryFunction, SkipToken } from '@tanstack/react-query';

import { createIsomorphicFn } from '@tanstack/react-start';

// Chave dos queryOptions de `api.ts`: o queryFn monta a requisição a partir dela.
type ApiQueryKey = readonly [method: string, path: string, init?: object];

interface ApiQueryOptions<TQueryFnData, TQueryKey extends ApiQueryKey> {
    queryKey: TQueryKey;
    queryFn?: QueryFunction<TQueryFnData, TQueryKey> | SkipToken;
}

// No navegador, `cache: 'reload'` faz o próprio fetch mandar `Cache-Control: no-cache`
// sem disparar preflight de CORS; no SSR o header vai direto.
const freshInit = createIsomorphicFn()
    .client((): RequestInit => ({ cache: 'reload' }))
    .server((): RequestInit => ({ headers: { 'Cache-Control': 'no-cache' } }));

/** Refaz a query pedindo à API que ignore o cache dela, e grava o resultado na mesma queryKey. */
export function refreshQuery<TQueryFnData, TQueryKey extends ApiQueryKey>(
    queryClient: QueryClient,
    { queryKey, queryFn }: ApiQueryOptions<TQueryFnData, TQueryKey>
): Promise<TQueryFnData> {
    if (typeof queryFn !== 'function') throw new Error('refreshQuery precisa de um queryFn');

    const [method, path, init] = queryKey;
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- mesma chave, só com o init fresco
    const freshKey = [method, path, { ...init, ...freshInit() }] as unknown as TQueryKey;
    return queryClient.query({
        queryKey,
        queryFn: (context) => queryFn({ ...context, queryKey: freshKey }),
        staleTime: 0
    });
}
