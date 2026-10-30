import type { Middleware } from 'openapi-fetch';

import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import type { Classroom } from '#/queries/classrooms';
import type { components } from '#/queries/schema.gen';

import {
    allClassroomsQueryOptions,
    classroomFrequencyQueryOptions,
    classroomPostsQueryOptions
} from '#/queries/classrooms';
import { apiClient } from '#/queries/client';
import { meQueryOptions } from '#/queries/me';
import { Route } from '#/routes/_app/turmas_.$id';

import { fakeQueryClient, runLoader } from '../helpers/route';

const classroom: Classroom = {
    id: 'AAA',
    number: '01',
    semester: '2026.2',
    current: true,
    professors: [],
    subject: { code: 'FGA0001', name: 'Cálculo' }
};

describe('cache da página da turma', () => {
    test('pré-carrega postagens e frequência antes de exibir as abas', async () => {
        const paths: unknown[] = [];
        const client = fakeQueryClient((key) => {
            paths.push(key[1]);
            if (key[1] === '/me') return { registration: '123' };
            if (key[1] === '/classrooms') return [classroom];
            return [];
        });
        const loaded = await runLoader(Route, {
            context: { queryClient: client },
            params: { id: 'AAA' }
        });
        expect(loaded.subjectName).toBe('Cálculo');
        expect(paths).toEqual([
            '/me',
            '/classrooms',
            '/classrooms/{classroom_id}/posts',
            '/classrooms/{classroom_id}/frequency'
        ]);
    });

    test.each([null, { registration: '123' }])(
        'não busca detalhes sem acesso à turma com perfil %p',
        async (user) => {
            const paths: unknown[] = [];
            const client = fakeQueryClient((key) => {
                paths.push(key[1]);
                return key[1] === '/me' ? user : [];
            });
            await runLoader(Route, { context: { queryClient: client }, params: { id: 'AAA' } });
            expect(paths).not.toContain('/classrooms/{classroom_id}/posts');
            expect(paths).not.toContain('/classrooms/{classroom_id}/frequency');
        }
    );

    test('falha nas postagens não impede carregar frequência e identificar a turma', async () => {
        const paths: unknown[] = [];
        const client = fakeQueryClient((key) => {
            paths.push(key[1]);
            if (key[1] === '/me') return { registration: '123' };
            if (key[1] === '/classrooms') return [classroom];
            if (key[1] === '/classrooms/{classroom_id}/posts')
                throw new Error('SIGAA indisponível');
            return {};
        });
        expect(
            await runLoader(Route, { context: { queryClient: client }, params: { id: 'AAA' } })
        ).toEqual({ subjectName: 'Cálculo' });
        expect(paths).toContain('/classrooms/{classroom_id}/frequency');
    });

    test('cache vencido aparece sem esperar a rede e é substituído após revalidar', async () => {
        const client = new QueryClient({
            defaultOptions: { queries: { retry: false, staleTime: Infinity } }
        });
        const posts = classroomPostsQueryOptions('AAA');
        const frequency = classroomFrequencyQueryOptions('AAA');
        const network = Promise.withResolvers<void>();
        const requested: string[] = [];
        const savedPosts = [{ id: 'news:1', type: 'news', title: 'Aviso salvo', attachments: [] }];
        const savedFrequency = { lessons: [], frequency_status: 'nao_registrada' };
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
        client.setQueryData(posts.queryKey, savedPosts, { updatedAt: 1 });
        client.setQueryData(frequency.queryKey, savedFrequency, { updatedAt: 1 });
        client.setQueryDefaults(posts.queryKey, { staleTime: 0 });
        client.setQueryDefaults(frequency.queryKey, { staleTime: 0 });
        const middleware: Middleware = {
            onRequest: async ({ request }) => {
                const path = new URL(request.url).pathname;
                requested.push(path);
                await network.promise;
                return Response.json(path.endsWith('/posts') ? [] : savedFrequency);
            }
        };
        apiClient.use(middleware);
        try {
            await runLoader(Route, { context: { queryClient: client }, params: { id: 'AAA' } });
            expect(client.getQueryData(posts.queryKey)).toEqual(savedPosts);
            expect(client.getQueryData(frequency.queryKey)).toEqual(savedFrequency);
            expect(client.getQueryState(posts.queryKey)?.fetchStatus).toBe('fetching');
            expect(client.getQueryState(frequency.queryKey)?.fetchStatus).toBe('fetching');
            network.resolve();
            await Promise.all([client.query(posts), client.query(frequency)]);
            expect(requested).toHaveLength(2);
            expect(client.getQueryData(posts.queryKey)).toEqual([]);
        } finally {
            network.resolve();
            apiClient.eject(middleware);
            client.clear();
        }
    });
});
