import type { UserSettings } from '@followw/core/queries/settings.ts';

import { api } from '@followw/core/queries/api.ts';
import { settingsQueryOptions } from '@followw/core/queries/settings.ts';
import { useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';

import { meQueryOptions } from '#/queries/me';

const EMPTY_SETTINGS: UserSettings = {};

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
