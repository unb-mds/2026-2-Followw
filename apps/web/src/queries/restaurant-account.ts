import type { QueryClient, QueryFunction } from '@tanstack/react-query';

import { queryOptions } from '@tanstack/react-query';

import type { components } from '#/queries/schema.gen';

import { STORAGE_KEYS, localStorageRepository } from '#/lib/local-storage';
import { api } from '#/queries/api';

export type RestaurantStatement = components['schemas']['RestaurantStatement'];
export type RestaurantCredentials = components['schemas']['RestaurantCredentials'];

type ApiKey = readonly [string, string, object?];
interface StoredAccount {
    registration: string;
    data: unknown;
    updatedAt: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function isStatement(value: unknown): value is RestaurantStatement {
    return (
        isRecord(value) &&
        (value.balance == null || isAmount(value.balance)) &&
        (value.group == null ||
            (typeof value.group === 'number' && [1, 2, 3, 4].includes(value.group))) &&
        Array.isArray(value.entries) &&
        value.entries.every(
            (entry: unknown) =>
                isRecord(entry) &&
                typeof entry.occurred_at === 'string' &&
                Number.isFinite(Date.parse(entry.occurred_at)) &&
                typeof entry.description === 'string' &&
                isAmount(entry.amount)
        )
    );
}

function isAmount(value: unknown): value is string {
    return typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value));
}

function isCredentials(value: unknown): value is RestaurantCredentials {
    return (
        isRecord(value) &&
        typeof value.token === 'string' &&
        value.token.length > 0 &&
        typeof value.valid_until === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(value.valid_until) &&
        Number.isFinite(Date.parse(value.valid_until))
    );
}

function readStored(key: string, registration: string, validate: (data: unknown) => boolean) {
    const stored = localStorageRepository.get(key);
    if (
        !isRecord(stored) ||
        stored.registration !== registration ||
        typeof stored.updatedAt !== 'number' ||
        !Number.isFinite(stored.updatedAt) ||
        !validate(stored.data)
    )
        return null;
    return { data: stored.data, updatedAt: stored.updatedAt };
}

function accountQuery<T, TKey extends ApiKey>(
    options: { queryKey: TKey; queryFn: QueryFunction<T, TKey> },
    registration: string,
    storageKey: string
) {
    return queryOptions({
        queryKey: [
            options.queryKey[0],
            options.queryKey[1],
            options.queryKey[2],
            registration
        ] as const,
        queryFn: async (context) => {
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- mesma chave da API, sem o escopo da conta
            const queryKey = context.queryKey.slice(0, 3) as unknown as TKey;
            const data = await options.queryFn({ ...context, queryKey });
            if (!context.signal.aborted) {
                localStorageRepository.set(storageKey, {
                    registration,
                    data,
                    updatedAt: Date.now()
                } satisfies StoredAccount);
            }
            return data;
        },
        staleTime: 60_000
    });
}

export const statementQueryOptions = (registration: string) =>
    accountQuery(
        api.queryOptions('get', '/me/ru-statement'),
        registration,
        STORAGE_KEYS.RU_BALANCE
    );

export const credentialsQueryOptions = (registration: string) =>
    accountQuery(api.queryOptions('get', '/me/ru-token'), registration, STORAGE_KEYS.RU_TOKEN);

export function restoreRestaurantAccount(queryClient: QueryClient, registration: string) {
    function restore(
        queryKey: readonly unknown[],
        storageKey: string,
        validate: (data: unknown) => boolean
    ) {
        const state = queryClient.getQueryState(queryKey);
        if (state?.data !== undefined) {
            localStorageRepository.set(storageKey, {
                registration,
                data: state.data,
                updatedAt: state.dataUpdatedAt
            } satisfies StoredAccount);
            return;
        }
        const stored = readStored(storageKey, registration, validate);
        if (stored)
            queryClient.setQueryData(queryKey, stored.data, { updatedAt: stored.updatedAt });
    }
    restore(statementQueryOptions(registration).queryKey, STORAGE_KEYS.RU_BALANCE, isStatement);
    restore(credentialsQueryOptions(registration).queryKey, STORAGE_KEYS.RU_TOKEN, isCredentials);
}

export function clearRestaurantAccount(queryClient: QueryClient) {
    for (const path of ['/me/ru-statement', '/me/ru-token']) {
        const queryKey = ['get', path];
        void queryClient.cancelQueries({ queryKey });
        queryClient.removeQueries({ queryKey });
    }
    localStorageRepository.remove(STORAGE_KEYS.RU_BALANCE);
    localStorageRepository.remove(STORAGE_KEYS.RU_TOKEN);
}
