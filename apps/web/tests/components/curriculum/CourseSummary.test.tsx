import type { Middleware } from 'openapi-fetch';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, test } from 'bun:test';

import type { CourseSummaryProps } from '#/components/curriculum/CourseSummary';
import type { PublicCourse } from '#/queries/courses';
import type { CourseCurriculum } from '#/queries/curriculum';

import { CourseSummary } from '#/components/curriculum/CourseSummary';
import { apiClient } from '#/queries/client';
import { coursesQueryOptions } from '#/queries/courses';
import { curriculumQueryOptions } from '#/queries/curriculum';

import { useDom } from '../../helpers/dom';

const dom = useDom();
const course: PublicCourse = {
    id: 42,
    sigaa_id: 100,
    name: 'ENGENHARIA DE SOFTWARE',
    shift: 'DIURNO',
    unit: { id: 1, code: 'FCTE', name: 'FACULDADE DE CIÊNCIAS E TECNOLOGIAS EM ENGENHARIA' },
    level: 'Graduação'
};
const matrix: CourseCurriculum = {
    sigaa_id: 2,
    code: '0123',
    course_id: 42,
    entry_semester: '2026.2',
    valid_from: '2024.1',
    matrix: 'ENGENHARIA DE SOFTWARE/FCTE - Bacharelado - Presencial - D',
    shift: 'D',
    degree: 'Bacharelado',
    modality: 'Presencial',
    periods: [
        { period: 1, subjects: [{ code: 'A', name: 'Base', hours: 60 }] },
        { period: 2, subjects: [{ code: 'B', name: 'Prática', hours: 30 }] }
    ],
    complementary: []
};
let client: QueryClient;
let middleware: Middleware;
let requests: string[];
beforeEach(() => {
    client = new QueryClient({
        defaultOptions: { queries: { staleTime: Infinity, retry: false } }
    });
    client.setQueryData(coursesQueryOptions.queryKey, [course]);
    client.setQueryData(curriculumQueryOptions(course.id, '2026.2').queryKey, matrix);
    requests = [];
    middleware = {
        onRequest: ({ request }) => {
            requests.push(new URL(request.url).pathname);
            return Response.json({ detail: 'Indisponível' }, { status: 503 });
        }
    };
    apiClient.use(middleware);
});
afterEach(() => {
    dom.testing.cleanup();
    client.clear();
    apiClient.eject(middleware);
});
function renderSummary(props: CourseSummaryProps = { course, entrySemester: '2026.2' }) {
    return dom.testing.render(
        <QueryClientProvider client={client}>
            <CourseSummary {...props} />
        </QueryClientProvider>
    );
}

test('resume unidade, turno, grau e matriz do curso com os dados já salvos', () => {
    const page = renderSummary();
    expect(page.getByRole('heading', { name: 'ENGENHARIA DE SOFTWARE' })).toBeDefined();
    expect(page.getByText('FCTE').parentElement?.textContent).toBe('FCTE · Matriz 0123 · 2026.2');
    expect(page.getByText('Diurno · Presencial')).toBeDefined();
    expect(page.getByText('Bacharelado')).toBeDefined();
    expect(page.getByText('Faculdade de Ciências e Tecnologias em Engenharia')).toBeDefined();
    expect(page.getByText('2 semestres · 2 matérias')).toBeDefined();
    expect(page.queryByText(matrix.matrix)).toBeNull();
    expect(requests).toEqual([]);
});

test('consulta a matriz do curso exibido sem reaproveitar a de outro curso', async () => {
    const other = { ...course, id: 99, name: 'ADMINISTRAÇÃO', shift: 'NOTURNO' };
    client.setQueryData(coursesQueryOptions.queryKey, [course, other]);
    const page = renderSummary({ course: other, entrySemester: '2026.2' });
    await dom.testing.waitFor(() =>
        expect(requests).toEqual(['/api/public/courses/99/curriculum'])
    );
    expect(page.getByText('Noturno')).toBeDefined();
    expect(page.queryByText('Bacharelado')).toBeNull();
});

test('sem semestre nem catálogo exibe apenas o que está disponível', () => {
    client.setQueryData(coursesQueryOptions.queryKey, []);
    const page = renderSummary({ course: { ...course, shift: null } });
    expect(page.getByText('Turno não informado')).toBeDefined();
    expect(page.getByText('Unidade não informada')).toBeDefined();
    expect(page.queryByText(/semestres/)).toBeNull();
    expect(requests).toEqual([]);
});

test('turno da matriz cobre o curso sem turno no catálogo', () => {
    const page = renderSummary({ course: { ...course, shift: null }, entrySemester: '2026.2' });
    expect(page.getByText('Diurno · Presencial')).toBeDefined();
});

test('contagem inclui somente matérias únicas que aparecem no fluxo', () => {
    client.setQueryData(curriculumQueryOptions(course.id, '2026.2').queryKey, {
        ...matrix,
        periods: [
            { period: 0, subjects: [{ code: 'FORA', name: 'Fora dos semestres' }] },
            {
                period: 1,
                subjects: [
                    { code: 'A', name: 'Base' },
                    { code: 'SEM_NOME', name: null },
                    { code: 'VAZIO', name: '   ' }
                ]
            },
            {
                period: 2,
                subjects: [
                    { code: 'A', name: 'Base repetida' },
                    { code: 'B', name: 'Prática' }
                ]
            }
        ],
        complementary: [{ code: 'OPT', name: 'Optativa fora do fluxo' }]
    });
    const page = renderSummary();
    expect(page.getByText('2 semestres · 2 matérias')).toBeDefined();
});

test('matriz vazia usa o singular e o plural corretos', () => {
    client.setQueryData(curriculumQueryOptions(course.id, '2026.2').queryKey, {
        ...matrix,
        periods: [{ period: 1, subjects: [{ code: 'A', name: 'Base' }] }]
    });
    const page = renderSummary();
    expect(page.getByText('1 semestre · 1 matéria')).toBeDefined();
});

test('grau e modalidade ausentes na matriz são omitidos', () => {
    client.setQueryData(curriculumQueryOptions(course.id, '2026.2').queryKey, {
        ...matrix,
        degree: null,
        modality: null
    });
    const page = renderSummary();
    expect(page.getByText('Diurno')).toBeDefined();
    expect(page.queryByText('Bacharelado')).toBeNull();
});
