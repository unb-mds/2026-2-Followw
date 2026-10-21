import type { Middleware } from 'openapi-fetch';

import { QueryClient, QueryClientProvider, noop } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createElement, type ReactNode } from 'react';

import {
    allClassroomsQueryOptions,
    classroomFrequencyQueryOptions,
    classroomMembersQueryOptions,
    classroomPostDetailQueryOptions,
    classroomPostsQueryOptions,
    useMarkLessons
} from '#/queries/classrooms';
import { apiClient } from '#/queries/client';

import { useDom } from '../helpers/dom';

describe('queries de turma', () => {
    test('consulta todas as turmas para abrir uma rota diretamente', () => {
        expect(allClassroomsQueryOptions.queryKey).toContainEqual({
            params: { query: { semester: 'all' } }
        });
    });

    test('isola postagens, frequência e participantes pelo ID da turma', () => {
        const first = 'TURMA-1';
        const second = 'TURMA-2';

        for (const query of [
            classroomPostsQueryOptions,
            classroomFrequencyQueryOptions,
            classroomMembersQueryOptions
        ]) {
            expect(query(first).queryKey).not.toEqual(query(second).queryKey);
        }
        expect(classroomPostDetailQueryOptions(first, 'news:1').queryKey).not.toEqual(
            classroomPostDetailQueryOptions(first, 'assessment:1').queryKey
        );
    });

    test('usa as rotas de posts com IDs opacos e filtro por categoria', () => {
        expect(classroomPostsQueryOptions('TURMA-1').queryKey[1]).toBe(
            '/classrooms/{classroom_id}/posts'
        );
        expect(classroomPostsQueryOptions('TURMA-1', 'material').queryKey).toContainEqual({
            params: { path: { classroom_id: 'TURMA-1' }, query: { type: 'material' } }
        });
        expect(classroomPostsQueryOptions('TURMA-1').queryKey).not.toEqual(
            classroomPostsQueryOptions('TURMA-1', 'material').queryKey
        );
        expect(classroomPostDetailQueryOptions('TURMA-1', 'material:abc').queryKey).toContainEqual({
            params: { path: { classroom_id: 'TURMA-1', post_id: 'material:abc' } }
        });
    });
});

describe('marcação de aulas', () => {
    const dom = useDom();
    const marks = [
        { lesson_id: '7b1c8f0e-0000-4000-8000-000000000001', status: 'presente' as const },
        { lesson_id: '7b1c8f0e-0000-4000-8000-000000000002', status: null }
    ];
    let client: QueryClient;
    let middleware: Middleware;
    let requests: Request[];
    let response: () => Response;

    beforeEach(() => {
        client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        requests = [];
        response = () => new Response(null, { status: 204 });
        middleware = {
            onRequest: ({ request }) => {
                requests.push(request);
                return response();
            }
        };
        apiClient.use(middleware);
    });

    afterEach(() => {
        dom.testing.cleanup();
        client.clear();
        apiClient.eject(middleware);
    });

    function renderMark() {
        const frequency = classroomFrequencyQueryOptions('TURMA-1').queryKey;
        client.setQueryData(frequency, { lessons: [] });
        const wrapper = ({ children }: { children: ReactNode }) =>
            createElement(QueryClientProvider, { client }, children);
        const { result } = dom.testing.renderHook(() => useMarkLessons('TURMA-1'), { wrapper });
        return { result, frequency };
    }

    test('envia todas as marcações num PATCH e relê a frequência', async () => {
        const { result, frequency } = renderMark();

        await dom.testing.act(() => result.current.mutateAsync(marks));

        expect(requests).toHaveLength(1);
        expect(requests[0].method).toBe('PATCH');
        expect(new URL(requests[0].url).pathname).toBe('/api/classrooms/TURMA-1/frequency/lessons');
        expect(await requests[0].json()).toEqual(marks);
        expect(client.getQueryState(frequency)?.isInvalidated).toBe(true);
    });

    test('falha ao salvar vira erro e também relê a frequência', async () => {
        response = () => Response.json({ detail: 'Lesson not found' }, { status: 404 });
        const { result, frequency } = renderMark();

        const error = await dom.testing.act(() =>
            result.current.mutateAsync(marks).then(noop, (reason: unknown) => reason)
        );

        expect(error).toBeInstanceOf(Error);
        expect(client.getQueryState(frequency)?.isInvalidated).toBe(true);
    });
});
