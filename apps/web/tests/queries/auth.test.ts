import { noop } from '@tanstack/react-query';
import { afterEach, describe, expect, test } from 'bun:test';

import type { components } from '#/queries/schema.gen.ts';

import { getContext } from '#/integrations/tanstack-query/root-provider.tsx';
import { clearSession } from '#/queries/auth.ts';
import { classroomNewsQueryOptions, classroomsQueryOptions } from '#/queries/classrooms.ts';
import { ApiError } from '#/queries/errors.ts';
import { meQueryOptions } from '#/queries/me.ts';
import { menuQueryOptions } from '#/queries/restaurant.ts';

const user: components['schemas']['UserProfile'] = {
    name: 'Fulano',
    registration: '251000000',
    photo: null,
    bio: null,
    unity: 'FCTE',
    course: 'Engenharia de Software',
    integralization: null,
    ira: null,
    mp: null,
    level: 'Graduação'
};

describe('clearSession', () => {
    afterEach(() => {
        Reflect.deleteProperty(globalThis, 'caches');
    });

    test('a promise só resolve depois de apagar o HTML em cache', async () => {
        const deleted: string[] = [];
        Object.defineProperty(globalThis, 'caches', {
            configurable: true,
            value: {
                keys: async () => ['followw-pages-x', 'outro-cache'],
                delete: async (name: string) => deleted.push(name)
            }
        });
        const { queryClient } = getContext();

        await clearSession(queryClient);

        expect(deleted).toEqual(['followw-pages-x']);
    });

    test('zera o usuário e remove as turmas do cache', async () => {
        const { queryClient } = getContext();
        queryClient.setQueryData(meQueryOptions.queryKey, user);
        queryClient.setQueryData(classroomsQueryOptions.queryKey, []);

        await clearSession(queryClient);

        expect(queryClient.getQueryData(meQueryOptions.queryKey)).toBeNull();
        expect(queryClient.getQueryState(classroomsQueryOptions.queryKey)).toBeUndefined();
    });

    test('remove todos os dados da conta e mantém os públicos', async () => {
        const { queryClient } = getContext();
        const news = classroomNewsQueryOptions('turma-1').queryKey;
        const menu = menuQueryOptions({ date: '2026-10-06' }).queryKey;
        queryClient.setQueryData(meQueryOptions.queryKey, user);
        queryClient.setQueryData(news, []);
        queryClient.setQueryData(menu, []);

        await clearSession(queryClient);

        expect(queryClient.getQueryState(news)).toBeUndefined();
        const cachedMenu: unknown = queryClient.getQueryData(menu);
        expect(cachedMenu).toEqual([]);
    });

    test('roda quando uma query autenticada volta 401', async () => {
        const { queryClient } = getContext();
        queryClient.setQueryData(meQueryOptions.queryKey, user);

        await queryClient
            .query({
                queryKey: classroomsQueryOptions.queryKey,
                queryFn: () => Promise.reject(new ApiError(401, 'expirada'))
            })
            .catch(noop);

        expect(queryClient.getQueryData(meQueryOptions.queryKey)).toBeNull();
    });

    test('mantém a sessão em erros que não são 401', async () => {
        const { queryClient } = getContext();
        queryClient.setQueryData(meQueryOptions.queryKey, user);

        await queryClient
            .query({
                queryKey: classroomsQueryOptions.queryKey,
                queryFn: () => Promise.reject(new ApiError(404, 'não achou')),
                retry: false
            })
            .catch(noop);

        expect(queryClient.getQueryData(meQueryOptions.queryKey)).not.toBeNull();
    });
});
