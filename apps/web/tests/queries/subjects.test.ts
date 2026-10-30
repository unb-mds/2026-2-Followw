import type { Middleware } from 'openapi-fetch';

import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import type { Classroom } from '#/queries/classrooms';
import type { CatalogSubject, Requirements, SubjectClassroom } from '#/queries/subjects';

import { apiClient } from '#/queries/client';
import {
    approvedCodes,
    currentCurriculumPeriod,
    filterSubjects,
    withClassrooms,
    seats,
    subjectRequirementLabel,
    subjectsQuery,
    subjectsQueryOptions
} from '#/queries/subjects';

const morning: SubjectClassroom = {
    number: '01',
    semester: '2026.2',
    schedule: '35M12',
    professors: [],
    vacancies: 50,
    occupied: 48
};
const night: SubjectClassroom = { ...morning, number: '02', schedule: '24N12', occupied: 50 };
const requirements = (groups: string[][]): Requirements =>
    groups.map((group) => group.map((code) => ({ code, subject: null })));
const subject: CatalogSubject = {
    code: 'FGA0003',
    name: 'COMPILADORES',
    prerequisites: requirements([['FGA0001', 'FGA0002'], ['FGA0010']]),
    classrooms: [morning, night]
};

describe('busca de matérias', () => {
    let middleware: Middleware;
    let client: QueryClient;
    let requests: Request[];

    beforeEach(() => {
        requests = [];
        middleware = {
            onRequest: ({ request }) => {
                requests.push(request);
                return Response.json([subject]);
            }
        };
        apiClient.use(middleware);
        client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    });
    afterEach(() => {
        client.clear();
        apiClient.eject(middleware);
    });

    test('consulta o endpoint público com o filtro escolhido', async () => {
        expect(await client.query(subjectsQueryOptions({ q: 'compila' }))).toEqual([subject]);
        const url = new URL(requests[0].url);
        expect(url.pathname).toBe('/api/public/subjects');
        expect(url.searchParams.get('q')).toBe('compila');
    });

    test.each([
        ['FGA0003', 'FCTE', { q: 'FGA0003' }],
        [' fga0003 ', null, { q: 'fga0003' }],
        [' cálculo 1 ', 'FCTE', { q: 'cálculo 1' }],
        ['Carlos Silva', null, { q: 'Carlos Silva' }],
        ['ab', 'FCTE', { unit: 'FCTE' }],
        ['ab', null, null],
        ['abc', null, { q: 'abc' }],
        ['a'.repeat(32), null, { q: 'a'.repeat(32) }],
        ['a'.repeat(33), 'FCTE', { unit: 'FCTE' }],
        ['  ', 'FCTE', { unit: 'FCTE' }],
        ['', null, null]
    ])('"%s" com unidade %s busca %p', (q, unit, expected) => {
        expect(subjectsQuery(q, unit)).toEqual(expected);
    });

    test('texto fora dos limites mantém a consulta anterior', () => {
        expect(subjectsQuery('ab', 'FCTE', { q: 'calculo' })).toEqual({ q: 'calculo' });
        expect(subjectsQuery('a'.repeat(33), null, null)).toBeNull();
        expect(subjectsQuery('', 'FCTE', { q: 'calculo' })).toEqual({ unit: 'FCTE' });
    });
});

const history = (code: string, grade: Classroom['grade'], current = false): Classroom => ({
    ...morning,
    id: code,
    subject: { code, name: code },
    grade,
    current
});

describe('pré-requisitos', () => {
    test('aprovado só com SS, MS ou MM em turma encerrada', () => {
        const approved = approvedCodes([
            history('A', 'SS'),
            history('B', 'MM'),
            history('C', 'MI'),
            history('D', 'SR'),
            history('E', 'SS', true),
            history('F', null)
        ]);
        expect([...approved]).toEqual(['A', 'B']);
    });

    test('mostra nomes resolvidos e mantém códigos sem relacionamento', () => {
        const groups = [
            [
                { code: 'MAT0023', subject: { code: 'MAT0023', name: 'Cálculo 1' } },
                { code: 'ANTIGO', subject: null }
            ]
        ];
        expect(groups[0].map(subjectRequirementLabel)).toEqual(['Cálculo 1', 'ANTIGO']);
    });
});

describe('filtros no cliente', () => {
    test('descarta matérias sem turmas', () => {
        expect(withClassrooms([subject, { ...subject, classrooms: [] }])).toEqual([subject]);
    });

    test('tipo mantém só as matérias do tipo escolhido', () => {
        const kinds: CatalogSubject[] = [
            { ...subject, code: 'mandatory', kind: 'mandatory' },
            { ...subject, code: 'optional', kind: 'optional' },
            { ...subject, code: 'free', kind: 'free' }
        ];
        expect(filterSubjects(kinds, 'all')).toHaveLength(3);
        expect(filterSubjects(kinds, 'optional').map((s) => s.code)).toEqual(['optional']);
        expect(filterSubjects([subject], 'mandatory')).toEqual([]);
    });

    test.each([
        [40, 10, 30, 'free'],
        [40, 31, 9, 'filling'],
        [40, 40, 0, 'full'],
        [40, 45, 0, 'full'],
        [0, 0, 0, 'full']
    ] as const)(
        'vagas %p com %p ocupadas: %p livres, %p',
        (vacancies, occupied, available, tone) => {
            expect(seats({ ...morning, vacancies, occupied })).toEqual({
                vacancies,
                occupied,
                available,
                occupancy: tone
            });
        }
    );

    test('cadeado distingue turma cheia de dado ausente', () => {
        expect(seats(night)?.available).toBe(0);
        expect(seats({ ...morning, vacancies: null })).toBeNull();
    });
});

test.each([
    ['2025.1', '2026.2', 4],
    ['2026.2', '2026.2', 1],
    ['2025.2', '2026.1', 2],
    ['2027.1', '2026.2', null],
    [null, '2026.2', null],
    ['2025.1', undefined, null],
    ['2025.3', '2026.2', null]
] as const)('calcula período atual para ingresso %s e semestre %s', (entry, semester, expected) => {
    expect(currentCurriculumPeriod(entry, semester)).toBe(expected);
});
