import { queryOptions, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';

import type { components } from '#/queries/schema.gen';

import { api } from '#/queries/api';
import { ApiError } from '#/queries/errors';
import { meQueryOptions } from '#/queries/me';

export type UserSettings = components['schemas']['UserSettings'];
export type UserSettingsPatch = components['schemas']['UserSettingsPatch'];

const EMPTY_SETTINGS: UserSettings = {};
const { queryKey, queryFn } = api.queryOptions('get', '/me/settings');

// sem login não há o que buscar: resolve vazio sem ir à API
export const settingsQueryOptions = (registration: string | null) =>
    queryOptions({
        queryKey: [...queryKey, registration] as const,
        queryFn: async (context) => {
            if (!registration) return EMPTY_SETTINGS;
            try {
                return (await queryFn({ ...context, queryKey })) ?? EMPTY_SETTINGS;
            } catch (error) {
                if (!(error instanceof ApiError && error.isUnauthorized)) throw error;
                return EMPTY_SETTINGS;
            }
        }
    });

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
            queryClient.setQueryData(settingsQueryOptions(user.registration).queryKey, data);
        }
    });
}
