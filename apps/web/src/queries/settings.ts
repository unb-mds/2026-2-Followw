import type { UserSettings } from '@followw/core/queries/settings.ts';

import { settingsQueryOptions } from '@followw/core/queries/settings.ts';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';

import { meQueryOptions } from '#/queries/me';

const EMPTY_SETTINGS: UserSettings = {};

export function useUserSettings(): UserSettings {
    const { data: user } = useSuspenseQuery(meQueryOptions);
    const { data } = useQuery(settingsQueryOptions(user?.registration ?? null));
    return data ?? EMPTY_SETTINGS;
}
