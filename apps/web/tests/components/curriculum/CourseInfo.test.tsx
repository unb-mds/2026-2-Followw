import type { Middleware } from 'openapi-fetch';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, test } from 'bun:test';

import type { CourseInfoProps } from '#/components/curriculum/CourseInfo';
import type { PublicCourse } from '#/queries/courses';
import type { CourseCurriculum } from '#/queries/curriculum';

import { CourseDetails } from '#/components/curriculum/CourseDetails';
import { CourseInfo } from '#/components/curriculum/CourseInfo';
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
    unit: { id: 1, code: 'FCTE', name: 'FACULDADE DE CIÊNCIAS E TECNOLOGIAS EM ENGENHARIA' }
};
const matrix: CourseCurriculum = {
    sigaa_id: 2,
    code: '0123',
    course_id: 42,
    entry_semester: '2026.2',
    valid_from: '2024.1',
    matrix: 'ENGENHARIA DE SOFTWARE/FCTE - Bacharelado - Presencial - D',
    shift: 'D',
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
function renderDetails(props: CourseInfoProps = { course, entrySemester: '2026.2' }) {
    return dom.testing.render(
        <QueryClientProvider client={client}>
            <CourseDetails {...props} />
        </QueryClientProvider>
    );
}

test('nome e ícone compartilham o controle acessível e não buscam detalhes antes de abrir', () => {
    const page = dom.testing.render(
        <QueryClientProvider client={client}>
            <CourseInfo course={course} entrySemester="2026.2" />
        </QueryClientProvider>
    );
    const trigger = page.getByRole('button', {
        name: 'Informações do curso Engenharia de Software'
    });
    expect(trigger.textContent).toBe('Engenharia de Software');
    expect(trigger.querySelector('svg')).not.toBeNull();
    expect(trigger.classList.contains('hover:text-primary')).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    dom.testing.fireEvent.click(trigger.querySelector('svg')!);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(requests).toEqual([]);
});

test('organiza unidade, turno e matriz do curso com os dados já salvos', () => {
    const page = renderDetails();
    for (const label of [
        'Unidade',
        'Turno',
        'Semestre de referência',
        'Grau acadêmico',
        'Modalidade',
        'Código da matriz',
        'Vigência desde',
        'Semestres na matriz',
        'Contagem de matérias'
    ]) {
        expect(page.getByText(label).tagName).toBe('DT');
    }
    expect(page.getByText(/FCTE/)).toBeDefined();
    expect(page.getByText('Diurno')).toBeDefined();
    expect(page.getByText('2026.2')).toBeDefined();
    expect(page.getByText('Bacharelado')).toBeDefined();
    expect(page.getByText('Presencial')).toBeDefined();
    expect(page.queryByText('Matriz curricular')).toBeNull();
    expect(page.queryByText(matrix.matrix)).toBeNull();
    expect(page.getByText('0123')).toBeDefined();
    expect(page.getByText('2024.1')).toBeDefined();
    expect(page.getByText('Semestres na matriz').nextElementSibling?.textContent).toBe('2');
    expect(page.getByText('Contagem de matérias').nextElementSibling?.textContent).toBe('2');
    expect(requests).toEqual([]);
});

test('consulta o curso exibido sem reaproveitar a matriz de outro curso', async () => {
    const other = { ...course, id: 99, name: 'ADMINISTRAÇÃO', shift: 'NOTURNO' };
    client.setQueryData(coursesQueryOptions.queryKey, [course, other]);
    const page = renderDetails({ course: other, entrySemester: '2026.2' });
    await page.findByText('Não foi possível carregar a matriz curricular.');
    expect(page.getByText('Noturno')).toBeDefined();
    expect(page.queryByText('Bacharelado')).toBeNull();
    expect(requests).toEqual(['/api/public/courses/99/curriculum']);
});

test('sem semestre não consulta matriz e apresenta somente os dados disponíveis', () => {
    client.setQueryData(coursesQueryOptions.queryKey, []);
    const page = renderDetails({ course: { ...course, shift: null } });
    expect(page.getByText('Não informada')).toBeDefined();
    expect(page.getAllByText('Não informado')).toHaveLength(2);
    expect(page.queryByText('Matriz curricular')).toBeNull();
    expect(page.queryByText('Carregando informações do curso...')).toBeNull();
    expect(requests).toEqual([]);
});

test('falha de atualização mantém o catálogo e a matriz salvos no card', async () => {
    client.setQueryDefaults(coursesQueryOptions.queryKey, { staleTime: 0 });
    const page = renderDetails();
    await page.findByText(
        'Não foi possível atualizar os dados do curso. Exibindo os dados salvos.'
    );
    expect(page.getByText('Diurno')).toBeDefined();
    expect(page.getByText('Bacharelado')).toBeDefined();
    expect(page.getByText('Presencial')).toBeDefined();
    expect(page.queryByText('Matriz curricular')).toBeNull();
    expect(page.queryByText(matrix.matrix)).toBeNull();
    expect(page.getByText(/FCTE/)).toBeDefined();
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
    const page = renderDetails();
    expect(page.getByText('Contagem de matérias').nextElementSibling?.textContent).toBe('2');
    expect(page.getByText('Semestres na matriz').nextElementSibling?.textContent).toBe('2');
});

test('matriz vazia informa zero matérias no fluxo', () => {
    client.setQueryData(curriculumQueryOptions(course.id, '2026.2').queryKey, {
        ...matrix,
        periods: []
    });
    const page = renderDetails();
    expect(page.getByText('Contagem de matérias').nextElementSibling?.textContent).toBe('0');
});

test('matriz sem modalidade mantém o grau e não confunde o turno com a modalidade', () => {
    client.setQueryData(curriculumQueryOptions(course.id, '2026.2').queryKey, {
        ...matrix,
        matrix: 'ADMINISTRAÇÃO - Bacharelado - D'
    });
    const page = renderDetails();
    expect(page.getByText('Grau acadêmico').nextElementSibling?.textContent).toBe('Bacharelado');
    expect(page.getByText('Modalidade').nextElementSibling?.textContent).toBe('Não informada');
    expect(page.getByText('Turno').nextElementSibling?.textContent).toBe('Diurno');
});

test('nome de curso com hífen não desloca o grau acadêmico e a modalidade', () => {
    client.setQueryData(curriculumQueryOptions(course.id, '2026.2').queryKey, {
        ...matrix,
        matrix: 'LETRAS - FRANCÊS - Licenciatura - A Distância - N'
    });
    const page = renderDetails();
    expect(page.getByText('Grau acadêmico').nextElementSibling?.textContent).toBe('Licenciatura');
    expect(page.getByText('Modalidade').nextElementSibling?.textContent).toBe('A Distância');
});
