import type { QueryClient } from '@tanstack/react-query';

import { queryOptions, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';

import type { components } from '#/queries/schema.gen';

import { STORAGE_KEYS, localStorageRepository } from '#/lib/local-storage';
import { api } from '#/queries/api';
import { ApiError } from '#/queries/errors';
import { meQueryOptions } from '#/queries/me';

export type UserSettings = components['schemas']['UserSettings'];
export type UserSettingsPatch = components['schemas']['UserSettingsPatch'];

interface StoredSettings {
    registration: string;
    data: UserSettings;
    updatedAt: number;
}

const EMPTY_SETTINGS: UserSettings = {};
const { queryKey, queryFn } = api.queryOptions('get', '/me/settings');

function storeSettings(registration: string, data: UserSettings, updatedAt = Date.now()) {
    localStorageRepository.set(STORAGE_KEYS.SETTINGS, {
        registration,
        data,
        updatedAt
    } satisfies StoredSettings);
}

export function getStoredSettings(registration: string): StoredSettings | null {
    const stored = localStorageRepository.get<Partial<StoredSettings>>(STORAGE_KEYS.SETTINGS);
    if (
        stored?.registration !== registration ||
        typeof stored.data !== 'object' ||
        stored.data === null ||
        typeof stored.updatedAt !== 'number'
    )
        return null;
    return { registration, data: stored.data, updatedAt: stored.updatedAt };
}

// sem login não há o que buscar: resolve vazio sem ir à API
export const settingsQueryOptions = (registration: string | null) =>
    queryOptions({
        queryKey: [...queryKey, registration] as const,
        queryFn: async (context) => {
            if (!registration) return EMPTY_SETTINGS;
            try {
                const data = (await queryFn({ ...context, queryKey })) ?? EMPTY_SETTINGS;
                if (!context.signal.aborted) storeSettings(registration, data);
                return data;
            } catch (error) {
                if (!(error instanceof ApiError && error.isUnauthorized)) throw error;
                localStorageRepository.remove(STORAGE_KEYS.SETTINGS);
                return EMPTY_SETTINGS;
            }
        }
    });

export function restoreSettings(queryClient: QueryClient, registration: string) {
    const options = settingsQueryOptions(registration);
    const state = queryClient.getQueryState(options.queryKey);
    if (state?.data !== undefined) {
        storeSettings(registration, state.data, state.dataUpdatedAt);
        return;
    }
    const stored = getStoredSettings(registration);
    if (stored)
        queryClient.setQueryData(options.queryKey, stored.data, { updatedAt: stored.updatedAt });
}

export function clearSettings(queryClient: QueryClient) {
    queryClient.removeQueries({ queryKey });
    localStorageRepository.remove(STORAGE_KEYS.SETTINGS);
}

export function useUserSettings(): UserSettings {
    const { data: user } = useSuspenseQuery(meQueryOptions);
    const { data } = useQuery(settingsQueryOptions(user?.registration ?? null));
    return data ?? EMPTY_SETTINGS;
}

export function useUpdateSettings() {
    const queryClient = useQueryClient();
    return api.useMutation('patch', '/me/settings', {
        onSuccess: (data) => {
            const user = queryClient.getQueryData(meQueryOptions.queryKey);
            if (!data || !user) return;
            storeSettings(user.registration, data);
            queryClient.setQueryData(settingsQueryOptions(user.registration).queryKey, data);
        }
    });
}
