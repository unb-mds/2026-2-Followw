import { describe, expect, test } from 'bun:test';

import type { UserProfile } from '../../src/queries/me.ts';

import { searchPlaceholder, searchView } from '../../src/lib/search-view.ts';
import { emptySubjectFilters } from '../../src/lib/subject-filters.ts';

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- só os campos que a busca lê
const student = { level: 'Graduação', unit: { code: 'CIC', name: 'CIC' } } as UserProfile;

describe('searchView', () => {
    test('filtro de tipo de matéria sem login pede para entrar', () => {
        const filters = { ...emptySubjectFilters, kind: ['mandatory' as const] };
        expect(searchView('all', '', null, null, filters)).toEqual({ kind: 'curriculum-login' });
    });

    test('sem texto, o aluno de graduação vê as recomendações', () => {
        expect(searchView('all', '', null, student, emptySubjectFilters)).toEqual({
            kind: 'recommendations',
            available: false
        });
    });

    test('com texto, faz a busca geral', () => {
        expect(searchView('all', 'calculo', 'calculo', student, emptySubjectFilters)).toEqual({
            kind: 'search',
            text: 'calculo',
            available: false
        });
    });

    test('sem texto, cursos e docentes mostram o catálogo', () => {
        expect(searchView('courses', '', null, null, emptySubjectFilters)).toEqual({
            kind: 'catalog',
            category: 'courses'
        });
    });

    test('a aba de estágios sempre lista o mural', () => {
        expect(searchView('internships', '', null, null, emptySubjectFilters)).toEqual({
            kind: 'internships',
            text: null
        });
    });

    test('sem recomendações, mostra as matérias da unidade do aluno', () => {
        const postgraduate: UserProfile = { ...student, level: 'Mestrado' };
        expect(searchView('classrooms', '', null, postgraduate, emptySubjectFilters)).toMatchObject(
            { kind: 'subjects', title: 'Matérias da CIC' }
        );
    });

    test('visitante sem texto nas turmas não tem lista', () => {
        expect(searchView('classrooms', '', null, undefined, emptySubjectFilters)).toBeNull();
    });
});

describe('searchPlaceholder', () => {
    test('cada aba sugere o que dá para buscar', () => {
        expect(searchPlaceholder('internships', emptySubjectFilters)).toBe('Busque por estágio');
        expect(searchPlaceholder('courses', emptySubjectFilters)).toBe(
            'Busque por matéria, curso ou professor'
        );
    });

    test('com filtro de matéria, o texto busca só matérias', () => {
        const filters = { ...emptySubjectFilters, days: '0' };
        expect(searchPlaceholder('all', filters)).toBe(
            'Busque por matéria, horário ou departamento'
        );
    });
});
