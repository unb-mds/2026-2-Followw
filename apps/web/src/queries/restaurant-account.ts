import type { QueryFunction } from '@tanstack/react-query';

import { queryOptions } from '@tanstack/react-query';

import type { components } from '#/queries/schema.gen';

import { api } from '#/queries/api';

export type RestaurantStatement = components['schemas']['RestaurantStatement'];
export type RestaurantCredentials = components['schemas']['RestaurantCredentials'];

type ApiKey = readonly [string, string, object?];

function accountQuery<T, TKey extends ApiKey>(
    options: { queryKey: TKey; queryFn: QueryFunction<T, TKey> },
    registration: string
) {
    return queryOptions({
        queryKey: [
            options.queryKey[0],
            options.queryKey[1],
            options.queryKey[2],
            registration
        ] as const,
        queryFn: (context) => {
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- mesma chave da API, sem o escopo da conta
            const queryKey = context.queryKey.slice(0, 3) as unknown as TKey;
            return options.queryFn({ ...context, queryKey });
        },
        staleTime: 30 * 60_000
    });
}

export const statementQueryOptions = (registration: string) =>
    accountQuery(api.queryOptions('get', '/me/ru-statement'), registration);

// A carteirinha salva nunca é refeita sozinha: só pelo botão de atualizar.
export const credentialsQueryOptions = (registration: string) => ({
    ...accountQuery(api.queryOptions('get', '/me/ru-token'), registration),
    staleTime: Infinity
});
