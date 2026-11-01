import type { Middleware } from 'openapi-fetch';

import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import type { Classroom } from '#/queries/classrooms';
import type { components } from '#/queries/schema.gen';

import { allClassroomsQueryOptions, classroomFrequencyQueryOptions } from '#/queries/classrooms';
import { apiClient } from '#/queries/client';
import { meQueryOptions } from '#/queries/me';
import { Route } from '#/routes/_app/turmas_.$id';

import { callRoute, fakeQueryClient, runLoader } from '../helpers/route';

const classroom: Classroom = {
    id: 'AAA',
    number: '01',
    semester: '2026.2',
    current: true,
    professors: [],
    subject: { code: 'FGA0001', name: 'Cálculo' }
};

function load(queryClient: QueryClient, searchStr = '') {
    return runLoader(Route, {
        context: { queryClient },
        params: { id: 'AAA' },
        location: { searchStr }
    });
}

describe('cache da página da turma', () => {
    test.each([
        ['', '/classrooms/{classroom_id}/frequency'],
        ['?tab=posts', '/classrooms/{classroom_id}/posts'],
        ['?tab=members', '/classrooms/{classroom_id}/members']
    ])('pré-carrega só a aba aberta em %p', async (searchStr, tabPath) => {
        const paths: unknown[] = [];
        const client = fakeQueryClient((key) => {
            paths.push(key[1]);
            if (key[1] === '/me') return { registration: '123' };
            if (key[1] === '/classrooms') return [classroom];
            return [];
        });
        const loaded = await load(client, searchStr);
        expect(loaded.subjectName).toBe('Cálculo');
        expect(paths).toEqual(['/me', '/classrooms', tabPath]);
    });

    test('trocar de aba não recarrega a rota', () => {
        expect(callRoute(Route.options.shouldReload, { cause: 'stay' })).toBe(false);
        expect(callRoute(Route.options.shouldReload, { cause: 'enter' })).toBe(true);
    });

    test.each([null, { registration: '123' }])(
        'não busca detalhes sem acesso à turma com perfil %p',
        async (user) => {
            const paths: unknown[] = [];
            const client = fakeQueryClient((key) => {
                paths.push(key[1]);
                return key[1] === '/me' ? user : [];
            });
            await load(client, '?tab=posts');
            expect(paths).not.toContain('/classrooms/{classroom_id}/posts');
        }
    );

    test('falha na aba aberta não impede identificar a turma', async () => {
        const client = fakeQueryClient((key) => {
            if (key[1] === '/me') return { registration: '123' };
            if (key[1] === '/classrooms') return [classroom];
            throw new Error('SIGAA indisponível');
        });
        expect(await load(client, '?tab=posts')).toEqual({ subjectName: 'Cálculo' });
    });

    test('cache vencido aparece sem esperar a rede e é substituído após revalidar', async () => {
        const client = new QueryClient({
            defaultOptions: { queries: { retry: false, staleTime: Infinity } }
        });
        const frequency = classroomFrequencyQueryOptions('AAA');
        const network = Promise.withResolvers<void>();
        const requested: string[] = [];
        const savedFrequency = { lessons: [], frequency_status: 'nao_registrada' };
        const freshFrequency = { lessons: [], frequency_status: 'registrada' };
        client.setQueryData<components['schemas']['UserProfile']>(meQueryOptions.queryKey, {
            name: 'Discente',
            registration: '123',
            photo: null,
            bio: null,
            unit: null,
            course: null,
            entry_semester: null,
            integralization: null,
            workload: null,
            period_max_workload: null,
            ira: null,
            mp: null,
            level: 'Graduação'
        });
        client.setQueryData(allClassroomsQueryOptions.queryKey, [classroom]);
        client.setQueryData(frequency.queryKey, savedFrequency, { updatedAt: 1 });
        client.setQueryDefaults(frequency.queryKey, { staleTime: 0 });
        const middleware: Middleware = {
            onRequest: async ({ request }) => {
                const path = new URL(request.url).pathname;
                requested.push(path);
                await network.promise;
                return Response.json(freshFrequency);
            }
        };
        apiClient.use(middleware);
        try {
            await load(client);
            expect(client.getQueryData(frequency.queryKey)).toEqual(savedFrequency);
            expect(client.getQueryState(frequency.queryKey)?.fetchStatus).toBe('fetching');
            network.resolve();
            await client.query(frequency);
            expect(requested).toHaveLength(1);
            expect(client.getQueryData(frequency.queryKey)).toEqual(freshFrequency);
        } finally {
            network.resolve();
            apiClient.eject(middleware);
            client.clear();
        }
    });
});

test.each([
    ['', '/classrooms/{classroom_id}/statistics'],
    ['?tab=frequency', '/classrooms/{classroom_id}/statistics'],
    ['?tab=statistics', '/classrooms/{classroom_id}/statistics'],
    ['?tab=posts', '/classrooms/{classroom_id}/posts'],
    ['?tab=members', '/classrooms/{classroom_id}/members']
])('turma antiga pré-carrega a aba correta em %p', async (searchStr, path) => {
    const paths: unknown[] = [];
    const client = fakeQueryClient((key) => {
        paths.push(key[1]);
        if (key[1] === '/me') return { registration: '123' };
        if (key[1] === '/classrooms') return [{ ...classroom, current: false }];
        return [];
    });
    await load(client, searchStr);
    expect(paths).toEqual(['/me', '/classrooms', path]);
});
