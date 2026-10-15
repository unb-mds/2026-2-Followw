import type { Middleware } from 'openapi-fetch';

import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import type { Classroom } from '#/queries/classrooms';
import type { CatalogSubject, Requirements, SubjectClassroom } from '#/queries/subjects';

import { apiClient } from '#/queries/client';
import {
    approvedCodes,
    availableSeats,
    filterSubjects,
    formatRequirements,
    isAvailability,
    isTurno,
    lockedReasons,
    prerequisitesMet,
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
        ['a'.repeat(24), null, { q: 'a'.repeat(24) }],
        ['a'.repeat(25), 'FCTE', { unit: 'FCTE' }],
        ['  ', 'FCTE', { unit: 'FCTE' }],
        ['', null, null]
    ])('"%s" com unidade %s busca %p', (busca, unit, expected) => {
        expect(subjectsQuery(busca, unit)).toEqual(expected);
    });

    test('texto fora dos limites mantém a consulta anterior', () => {
        expect(subjectsQuery('ab', 'FCTE', { q: 'calculo' })).toEqual({ q: 'calculo' });
        expect(subjectsQuery('a'.repeat(25), null, null)).toBeNull();
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

    test('avalia OU de Es pelos códigos aprovados', () => {
        const groups = subject.prerequisites;
        expect(prerequisitesMet(groups, new Set(['FGA0001', 'FGA0002']))).toBe(true);
        expect(prerequisitesMet(groups, new Set(['FGA0010']))).toBe(true);
        expect(prerequisitesMet(groups, new Set(['FGA0001']))).toBe(false);
        expect(prerequisitesMet(groups, null)).toBeNull();
        expect(prerequisitesMet(null, new Set())).toBe(true);
        expect(prerequisitesMet([], null)).toBe(true);
    });

    test('formata a expressão para leitura', () => {
        expect(formatRequirements(requirements([['A', 'B'], ['C']]))).toBe('(A e B) ou C');
        expect(formatRequirements(requirements([['A', 'B']]))).toBe('A e B');
        expect(formatRequirements(requirements([['A'], ['B']]))).toBe('A ou B');
    });

    test('mostra nomes resolvidos e mantém códigos sem relacionamento', () => {
        const groups = [
            [
                { code: 'MAT0023', subject: { code: 'MAT0023', name: 'Cálculo 1' } },
                { code: 'ANTIGO', subject: null }
            ]
        ];
        expect(formatRequirements(groups)).toBe('Cálculo 1 e ANTIGO');
        expect(prerequisitesMet(groups, new Set(['MAT0023', 'ANTIGO']))).toBe(true);
    });
});

describe('filtros no cliente', () => {
    test('turno filtra pelo horário e descarta matérias sem turmas', () => {
        const nightOnly = filterSubjects(
            [subject],
            { turno: 'Noite', disponibilidade: 'Todas' },
            null
        );
        expect(nightOnly[0].classrooms).toEqual([night]);
        expect(
            filterSubjects([subject], { turno: 'Tarde', disponibilidade: 'Todas' }, null)
        ).toEqual([]);
    });

    test('disponibilidade considera lotação e pré-requisitos', () => {
        const filters = { turno: 'Todos', disponibilidade: 'Disponíveis' } as const;
        expect(filterSubjects([subject], filters, null)[0].classrooms).toEqual([morning]);
        expect(filterSubjects([subject], filters, new Set())).toEqual([]);
        const locked = filterSubjects(
            [subject],
            { ...filters, disponibilidade: 'Indisponíveis' },
            new Set(['FGA0010'])
        );
        expect(locked[0].classrooms).toEqual([night]);
    });

    test('cadeado distingue turma cheia de dado ausente', () => {
        expect(availableSeats(night)).toBe(0);
        expect(availableSeats({ ...morning, vacancies: null })).toBeNull();
        expect(lockedReasons(night, false)).toEqual([
            'Turma cheia',
            'Pré-requisitos não atendidos'
        ]);
        expect(lockedReasons(morning, null)).toEqual([]);
    });

    test('aceita apenas opções válidas', () => {
        expect(isTurno('Noite')).toBe(true);
        expect(isTurno('Madrugada')).toBe(false);
        expect(isAvailability('Disponíveis')).toBe(true);
        expect(isAvailability('Talvez')).toBe(false);
    });
});
