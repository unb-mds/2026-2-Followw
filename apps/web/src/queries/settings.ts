import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';

import type { components } from '#/queries/schema.gen';

import { localStorageRepository, STORAGE_KEYS } from '#/lib/local-storage';
import { api } from '#/queries/api';
import { ApiError } from '#/queries/errors';
import { meQueryOptions } from '#/queries/me';

export type UserSettings = components['schemas']['UserSettings'];
export type UserSettingsPatch = components['schemas']['UserSettingsPatch'];

export function getStoredSettings(): UserSettings {
    return localStorageRepository.get<UserSettings>(STORAGE_KEYS.SETTINGS) ?? {};
}

const { queryKey, queryFn } = api.queryOptions('get', '/me/settings');

export const settingsQueryOptions = queryOptions({
    queryKey,
    queryFn: async (context) => {
        try {
            const data = await queryFn(context);
            if (data) {
                // Sincronização: o que está no banco sempre substitui o local
                localStorageRepository.set(STORAGE_KEYS.SETTINGS, data);
            }
            return data ?? null;
        } catch (error) {
            if (error instanceof ApiError && error.isUnauthorized) return null;
            throw error;
        }
    }
});

export function useSyncSettings() {
    const { data: user } = useQuery(meQueryOptions);
    useQuery({
        ...settingsQueryOptions,
        enabled: Boolean(user)
    });
}

export function useUserSettings(): UserSettings {
    const { data } = useQuery({
        ...settingsQueryOptions,
        select: () => getStoredSettings()
    });

    return data ?? getStoredSettings();
}

export function useUpdateSettings() {
    const queryClient = useQueryClient();
    return api.useMutation('patch', '/me/settings', {
        onSuccess: (data) => {
            if (data) {
                localStorageRepository.set(STORAGE_KEYS.SETTINGS, data);
                queryClient.setQueryData(settingsQueryOptions.queryKey, data);
            }
        }
    });
}
