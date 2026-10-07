import {
    type QueryExecuteOptions,
    type QueryClient,
    type QueryKey,
    noop
} from '@tanstack/react-query';

// loaders: com dado em cache resolve na hora e revalida em segundo plano; sem cache, espera a rede
export function loadQuery<TData, TError, TQueryKey extends QueryKey>(
    queryClient: QueryClient,
    options: QueryExecuteOptions<TData, TError, TData, TData, TQueryKey>
): Promise<TData> {
    const cached = queryClient.getQueryData<TData>(options.queryKey);
    const request = queryClient.query(options);
    if (cached === undefined) return request;
    request.catch(noop);
    return Promise.resolve(cached);
}
