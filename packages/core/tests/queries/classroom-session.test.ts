import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import {
    classroomPostsQueryOptions,
    classroomTeachingPlanQueryOptions
} from '../../src/queries/classrooms.ts';
import { apiClient } from '../../src/queries/client.ts';
import { refreshQuery } from '../../src/queries/refresh.ts';

describe('formulários da sessão SIGAA', () => {
    test.each([false, true])('serializa cache frio e atualização forçada: %p', async (refresh) => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        let form = 0;
        let active = 0;
        let maxActive = 0;
        const order: string[] = [];
        const middleware = {
            onRequest: async ({ request }: { request: Request }) => {
                const version = ++form;
                active++;
                maxActive = Math.max(maxActive, active);
                const path = new URL(request.url).pathname;
                order.push(path.split('/').at(-1)!);
                await new Promise((resolve) => setTimeout(resolve, 10));
                active--;
                if (version !== form)
                    return Response.json({ detail: 'Formulário invalidado' }, { status: 502 });
                return Response.json(path.endsWith('/posts') ? [] : null);
            }
        };
        apiClient.use(middleware);
        try {
            const posts = classroomPostsQueryOptions('AAA');
            const plan = classroomTeachingPlanQueryOptions('AAA');
            const result = await Promise.all([
                refresh ? refreshQuery(client, posts) : client.query(posts),
                refresh ? refreshQuery(client, plan) : client.query(plan)
            ]);
            expect(result).toEqual([[], null]);
            expect(maxActive).toBe(1);
            expect(order).toEqual(['posts', 'teaching-plan']);
        } finally {
            apiClient.eject(middleware);
            client.clear();
        }
    });

    test('falha de uma consulta libera a próxima', async () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const middleware = {
            onRequest: ({ request }: { request: Request }) =>
                request.url.endsWith('/posts')
                    ? Response.json({ detail: 'Falha' }, { status: 502 })
                    : Response.json(null)
        };
        apiClient.use(middleware);
        try {
            const results = await Promise.allSettled([
                client.query(classroomPostsQueryOptions('AAA')),
                client.query(classroomTeachingPlanQueryOptions('AAA'))
            ]);
            expect(results[0]?.status).toBe('rejected');
            expect(results[1]).toEqual({ status: 'fulfilled', value: null });
        } finally {
            apiClient.eject(middleware);
            client.clear();
        }
    });
    test('cancelar a consulta não libera a sessão antes de a requisição terminar', async () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const started = Promise.withResolvers<Request>();
        const finished = Promise.withResolvers<void>();
        const requests: string[] = [];
        const middleware = {
            onRequest: async ({ request }: { request: Request }) => {
                const path = new URL(request.url).pathname;
                requests.push(path.split('/').at(-1)!);
                if (!path.endsWith('/posts')) return Response.json(null);
                started.resolve(request);
                return new Promise<Response>((resolve, reject) => {
                    request.signal.addEventListener('abort', () => reject(request.signal.reason), {
                        once: true
                    });
                    void finished.promise.then(() => resolve(Response.json([])));
                });
            }
        };
        apiClient.use(middleware);
        const posts = classroomPostsQueryOptions('AAA');
        const first = client.query(posts).catch(() => undefined);
        try {
            const request = await started.promise;
            await client.cancelQueries({ queryKey: posts.queryKey });
            const next = client.query(classroomTeachingPlanQueryOptions('AAA'));
            expect(request.signal.aborted).toBe(false);
            await new Promise((resolve) => setTimeout(resolve, 0));
            expect(requests).toEqual(['posts']);
            finished.resolve();
            expect(await next).toBeNull();
            expect(requests).toEqual(['posts', 'teaching-plan']);
        } finally {
            finished.resolve();
            await first;
            apiClient.eject(middleware);
            client.clear();
        }
    });
    test('consulta cancelada na fila não chega ao servidor nem bloqueia a próxima', async () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const started = Promise.withResolvers<void>();
        const finished = Promise.withResolvers<void>();
        const requests: string[] = [];
        const middleware = {
            onRequest: async ({ request }: { request: Request }) => {
                requests.push(new URL(request.url).pathname);
                if (request.url.endsWith('/posts')) {
                    started.resolve();
                    await finished.promise;
                    return Response.json([]);
                }
                return Response.json(null);
            }
        };
        apiClient.use(middleware);
        const posts = client.query(classroomPostsQueryOptions('AAA'));
        try {
            await started.promise;
            const options = classroomTeachingPlanQueryOptions('AAA');
            const cancelled = client.query(options).catch(() => undefined);
            await client.cancelQueries({ queryKey: options.queryKey });
            const next = client.query(classroomTeachingPlanQueryOptions('BBB'));
            finished.resolve();
            await Promise.all([posts, cancelled, next]);
            expect(requests).toEqual([
                '/api/classrooms/AAA/posts',
                '/api/classrooms/BBB/teaching-plan'
            ]);
        } finally {
            finished.resolve();
            await posts;
            apiClient.eject(middleware);
            client.clear();
        }
    });

    test('clientes de sessões distintas não compartilham a fila', async () => {
        const clients = [new QueryClient(), new QueryClient()];
        const bothStarted = Promise.withResolvers<void>();
        const finished = Promise.withResolvers<void>();
        let active = 0;
        const middleware = {
            onRequest: async () => {
                if (++active === 2) bothStarted.resolve();
                await finished.promise;
                return Response.json(null);
            }
        };
        apiClient.use(middleware);
        const requests = clients.map((client) =>
            client.query(classroomTeachingPlanQueryOptions('AAA'))
        );
        try {
            await bothStarted.promise;
            expect(active).toBe(2);
            finished.resolve();
            expect(await Promise.all(requests)).toEqual([null, null]);
        } finally {
            finished.resolve();
            await Promise.all(requests);
            apiClient.eject(middleware);
            for (const client of clients) client.clear();
        }
    });
});
