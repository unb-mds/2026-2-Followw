import type { QueryFunction } from '@tanstack/react-query';

import { queryOptions } from '@tanstack/react-query';

import type { components } from '#/queries/schema.gen';

import { cardIsExpired } from '#/lib/restaurant';
import { nowInBrasilia } from '#/lib/schedule';
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
        staleTime: STATEMENT_STALE_TIME
    });
}

const STATEMENT_STALE_TIME = 90 * 60_000;

export const statementQueryOptions = (registration: string) =>
    accountQuery(api.queryOptions('get', '/me/ru-statement'), registration);

// Dentro da validade, a carteirinha salva só é refeita pelo botão de atualizar.
export const credentialsQueryOptions = (registration: string) => {
    const options = accountQuery(api.queryOptions('get', '/me/ru-token'), registration);
    return queryOptions({
        ...options,
        staleTime: ({ state: { data } }) =>
            data && !cardIsExpired(data.valid_until, nowInBrasilia().date)
                ? Infinity
                : STATEMENT_STALE_TIME
    });
};
