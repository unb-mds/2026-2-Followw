import type { QueryClient, QueryFunction, SkipToken } from '@tanstack/react-query';

// Chave dos queryOptions de `api.ts`: o queryFn monta a requisição a partir dela.
type ApiQueryKey = readonly [method: string, path: string, init?: object, ...scope: unknown[]];

interface ApiQueryOptions<TQueryFnData, TQueryKey extends ApiQueryKey> {
    queryKey: TQueryKey;
    queryFn?: QueryFunction<TQueryFnData, TQueryKey> | SkipToken;
}

// `cache: 'reload'` no navegador evita o preflight de CORS que o header causaria; as demais
// plataformas mandam o header direto (padrão).
const FRESH_INIT: RequestInit = { headers: { 'Cache-Control': 'no-cache' } };

/** Refaz a query pedindo à API que ignore o cache dela, e grava o resultado na mesma queryKey. */
export function refreshQuery<TQueryFnData, TQueryKey extends ApiQueryKey>(
    queryClient: QueryClient,
    { queryKey, queryFn }: ApiQueryOptions<TQueryFnData, TQueryKey>,
    { init = FRESH_INIT, ...options }: { retry?: boolean; init?: RequestInit } = {}
): Promise<TQueryFnData> {
    if (typeof queryFn !== 'function') throw new Error('refreshQuery precisa de um queryFn');

    const [method, path, queryInit, ...scope] = queryKey;
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- mesma chave, só com o init fresco
    const freshKey = [method, path, { ...queryInit, ...init }, ...scope] as unknown as TQueryKey;
    return queryClient.query({
        queryKey,
        queryFn: (context) => queryFn({ ...context, queryKey: freshKey }),
        staleTime: 0,
        ...options
    });
}
