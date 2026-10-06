import type { Middleware } from 'openapi-fetch';

import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import type { UserSettings } from '#/queries/settings';

import { STORAGE_KEYS, localStorageRepository } from '#/lib/local-storage';
import { clearSession } from '#/queries/auth';
import { apiClient } from '#/queries/client';
import { ApiError } from '#/queries/errors';
import { getStoredSettings, restoreSettings, settingsQueryOptions } from '#/queries/settings';

import { MemoryStorage } from '../helpers/memory-storage';

const registration = '251000000';
const settings: UserSettings = { displayName: 'Ana', defaultRuCampus: 'Gama' };

function seed(data: UserSettings = settings, owner = registration) {
    localStorageRepository.set(STORAGE_KEYS.SETTINGS, { registration: owner, data, updatedAt: 1 });
}

describe('configurações do usuário', () => {
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    let middleware: Middleware;
    let requests: Request[];
    let response: () => Response;
    let client: QueryClient;

    beforeEach(() => {
        Object.defineProperty(globalThis, 'window', {
            configurable: true,
            value: { localStorage: new MemoryStorage() }
        });
        requests = [];
        response = () => Response.json(settings);
        middleware = {
            onRequest: ({ request }) => {
                requests.push(request);
                return response();
            }
        };
        apiClient.use(middleware);
        client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    });

    afterEach(() => {
        client.clear();
        apiClient.eject(middleware);
        if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
        else Reflect.deleteProperty(globalThis, 'window');
    });

    test('busca na API e substitui o cache local com escopo da matrícula', async () => {
        seed({ displayName: 'Antigo' });

        expect(await client.query(settingsQueryOptions(registration))).toEqual(settings);
        expect(getStoredSettings(registration)?.data).toEqual(settings);
        expect(requests.map((request) => new URL(request.url).pathname)).toEqual(['/me/settings']);
    });

    test('sem login resolve vazio sem ir à API', async () => {
        expect(await client.query(settingsQueryOptions(null))).toEqual({});
        expect(requests).toHaveLength(0);
    });

    test('sessão expirada apaga o cache local e resolve vazio', async () => {
        seed();
        response = () => {
            throw new ApiError(401, 'expirada');
        };

        expect(await client.query(settingsQueryOptions(registration))).toEqual({});
        expect(localStorageRepository.get(STORAGE_KEYS.SETTINGS)).toBeNull();
    });

    test('restaura o cache local só da mesma matrícula', () => {
        seed();
        restoreSettings(client, 'outra-matricula');
        expect(
            client.getQueryData(settingsQueryOptions('outra-matricula').queryKey)
        ).toBeUndefined();
        expect(getStoredSettings('outra-matricula')).toBeNull();

        restoreSettings(client, registration);
        expect(
            client.getQueryData<UserSettings>(settingsQueryOptions(registration).queryKey)
        ).toEqual(settings);
        expect(
            client.getQueryState(settingsQueryOptions(registration).queryKey)?.dataUpdatedAt
        ).toBe(1);
    });

    test('persiste dados carregados no SSR sem sobrescrevê-los com o cache antigo', () => {
        seed({ displayName: 'Antigo' });
        client.setQueryData(settingsQueryOptions(registration).queryKey, settings);

        restoreSettings(client, registration);

        expect(getStoredSettings(registration)?.data).toEqual(settings);
    });

    test('ignora cache local malformado', () => {
        localStorageRepository.set(STORAGE_KEYS.SETTINGS, { displayName: 'legado' });
        expect(getStoredSettings(registration)).toBeNull();
    });

    test('logout apaga as configurações do cache e do local storage', async () => {
        await client.query(settingsQueryOptions(registration));

        clearSession(client);

        expect(client.getQueryData(settingsQueryOptions(registration).queryKey)).toBeUndefined();
        expect(localStorageRepository.get(STORAGE_KEYS.SETTINGS)).toBeNull();
    });
});
