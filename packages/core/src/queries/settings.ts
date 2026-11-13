import { queryOptions } from '@tanstack/react-query';

import type { components } from './schema.gen.ts';

import { api } from './api.ts';
import { ApiError } from './errors.ts';

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
