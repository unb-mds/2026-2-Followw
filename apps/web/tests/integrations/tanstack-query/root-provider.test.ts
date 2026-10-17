import { environmentManager, noop, onlineManager } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import type { components } from '#/queries/schema.gen.ts';

import { getContext } from '#/integrations/tanstack-query/root-provider.tsx';
import { ApiError } from '#/queries/errors.ts';
import { meQueryOptions } from '#/queries/me.ts';

const queryKey = ['get', '/classrooms'];
const user: components['schemas']['UserProfile'] = {
    name: 'Fulano',
    registration: '251000000',
    photo: null,
    bio: null,
    unity: 'FCTE',
    course: 'Engenharia de Software',
    shift: 'DIURNO',
    entry_semester: null,
    integralization: null,
    workload: null,
    ira: null,
    mp: null,
    level: 'Graduação'
};
const isServer = environmentManager.isServer();

// as regras de retry e rede valem só no navegador
describe('QueryClient do app no navegador', () => {
    beforeEach(() => {
        environmentManager.setIsServer(() => false);
    });

    afterEach(() => {
        environmentManager.setIsServer(() => isServer);
        onlineManager.setOnline(true);
    });

    test('offline falha na hora, sem pausar nem tentar de novo', async () => {
        const { queryClient } = getContext();
        onlineManager.setOnline(false);
        let attempts = 0;

        const error = await queryClient
            .query({
                queryKey,
                queryFn: () => {
                    attempts += 1;
                    return Promise.reject(new TypeError('offline'));
                }
            })
            .catch((reason: unknown) => reason);

        expect(error).toBeInstanceOf(TypeError);
        expect(attempts).toBe(1);
    });

    test('conexão que cai durante o retry não deixa a query pausada', async () => {
        const { queryClient } = getContext();
        let attempts = 0;

        const error = await queryClient
            .query({
                queryKey,
                retryDelay: 10,
                queryFn: () => {
                    attempts += 1;
                    // a primeira falha decide o retry online; a conexão cai durante a espera
                    if (attempts === 1) setTimeout(() => onlineManager.setOnline(false), 0);
                    return Promise.reject(new ApiError(503, 'fora'));
                }
            })
            .catch((reason: unknown) => reason);

        expect(error).toBeInstanceOf(ApiError);
        expect(attempts).toBe(2);
    });
});

describe('sessão expirada', () => {
    test.each([
        [401, true],
        [502, false]
    ])('mutation com %s encerra a sessão: %s', async (status, cleared) => {
        const { queryClient } = getContext();
        queryClient.setQueryData(meQueryOptions.queryKey, user);

        await queryClient
            .getMutationCache()
            .build(queryClient, { mutationFn: () => Promise.reject(new ApiError(status, 'x')) })
            .execute(undefined)
            .catch(noop);

        const cached: unknown = queryClient.getQueryData(meQueryOptions.queryKey);
        expect(cached).toEqual(cleared ? null : user);
    });
});
