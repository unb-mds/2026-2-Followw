import { noop } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import type { components } from '#/queries/schema.gen.ts';

import { getContext } from '#/integrations/tanstack-query/root-provider.tsx';
import { clearSession } from '#/queries/auth.ts';
import { classroomsQueryOptions } from '#/queries/classrooms.ts';
import { ApiError } from '#/queries/errors.ts';
import { meQueryOptions } from '#/queries/me.ts';

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
    test('zera o usuário e remove as turmas do cache', () => {
        const { queryClient } = getContext();
        queryClient.setQueryData(meQueryOptions.queryKey, user);
        queryClient.setQueryData(classroomsQueryOptions.queryKey, []);

        clearSession(queryClient);

        expect(queryClient.getQueryData(meQueryOptions.queryKey)).toBeNull();
        expect(queryClient.getQueryState(classroomsQueryOptions.queryKey)).toBeUndefined();
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
