import { describe, expect, test } from 'bun:test';

import type { Classroom } from '#/queries/classrooms';

import { academicState, initialMobilePeriod, normalizeCurriculum } from '#/lib/curriculum/model';

import { curriculum, type RawCurriculum } from '../../helpers/curriculum';

const raw: RawCurriculum = {
    sigaa_id: 1,
    code: '01',
    course_id: 42,
    entry_semester: '2024.2',
    valid_from: '2024.1',
    matrix: 'Teste',
    shift: 'D',
    periods: [
        {
            period: 2,
            subjects: [
                {
                    code: 'B',
                    name: 'Avançada',
                    hours: 45,
                    prerequisites: [['A', 'EXTERNA'], ['C']],
                    corequisites: [['D']],
                    equivalences: [['E']]
                }
            ]
        },
        { period: 0, subjects: [{ code: 'OPT', hours: 30 }] },
        {
            period: 1,
            subjects: [
                { code: 'A', name: 'Base', hours: 60 },
                { code: 'C', name: 'Alternativa', hours: null }
            ]
        },
        { period: 4, subjects: [{ code: 'D', name: 'Prática', hours: 20 }] }
    ],
    complementary: [{ code: 'E', hours: 60 }]
};
const model = normalizeCurriculum(curriculum(raw));
const classroom = (
    code: string,
    status: Classroom['status'],
    grade: Classroom['grade'] = null,
    current = false
): Classroom => ({
    id: code,
    subject: { code, name: code },
    status,
    grade,
    current,
    number: '01',
    semester: '2026.2',
    professors: []
});

describe('matriz e estados acadêmicos', () => {
    test('exclui período zero e complementares e ordena períodos reais', () => {
        expect(model.periods).toEqual([1, 2, 4]);
        expect(model.subjects.map((s) => s.code)).toEqual(['A', 'C', 'B', 'D']);
        expect(model.byCode.has('OPT')).toBe(false);
        expect(model.byCode.has('E')).toBe(false);
    });
    test('lista o que cada matéria desbloqueia apenas por pré-requisitos', () => {
        expect(model.unlocks.get('A')?.map((s) => s.code)).toEqual(['B']);
        expect(model.unlocks.get('C')?.map((s) => s.code)).toEqual(['B']);
        expect(model.unlocks.has('D')).toBe(false);
        expect(model.unlocks.has('B')).toBe(false);
    });
    test('oculta matérias sem nome e suas linhas sem remover requisitos ou matérias com nome e carga ausente', () => {
        const data = curriculum({
            ...raw,
            periods: [
                {
                    period: 1,
                    subjects: [
                        { code: 'A', name: 'Base', hours: null },
                        { code: 'B', name: null, prerequisites: [['A']] },
                        { code: 'C' },
                        { code: 'D', name: '   ' },
                        {
                            code: 'E',
                            name: 'Avançada',
                            prerequisites: [['B', 'A']],
                            corequisites: [['C']]
                        }
                    ]
                }
            ]
        });
        const visible = normalizeCurriculum(data);
        expect(visible.subjects.map((subject) => subject.code)).toEqual(['A', 'E']);
        expect([...visible.byCode.keys()]).toEqual(['A', 'E']);
        expect(visible.edges.map((edge) => [edge.source, edge.target])).toEqual([['A', 'E']]);
        expect(
            visible.byCode.get('E')!.prerequisites!.map((group) => group.map(({ code }) => code))
        ).toEqual([['B', 'A']]);
        expect(data.periods[0].subjects).toHaveLength(5);
        data.periods[0].subjects[1].name = 'Dados disponíveis';
        expect(normalizeCurriculum(data).byCode.has('B')).toBe(true);
    });
    test('aprovação prevalece sobre matrícula e atraso inclui o semestre atual', () => {
        const state = academicState(
            [
                classroom('A', 'concluido', 'MM'),
                classroom('A', 'cursando'),
                classroom('C', 'cursando')
            ],
            2
        );
        expect(model.subjects.map(state)).toEqual(['completed', 'enrolled', 'overdue', 'pending']);
    });
    test('sem histórico o estado é desconhecido; sem período não inventa atraso', () => {
        expect(model.subjects.map(academicState(undefined, 4))).toEqual([
            'unknown',
            'unknown',
            'unknown',
            'unknown'
        ]);
        expect(model.subjects.map(academicState([], null))).toEqual([
            'pending',
            'pending',
            'pending',
            'pending'
        ]);
        expect(academicState([classroom('A', 'concluido', 'MI')], 1)(model.byCode.get('A')!)).toBe(
            'overdue'
        );
    });
    test('abre mobile no período atual do curso do aluno e no primeiro para outros cursos', () => {
        expect(initialMobilePeriod(model.periods, true, 2)).toBe(2);
        expect(initialMobilePeriod(model.periods, false, 2)).toBe(1);
        expect(initialMobilePeriod(model.periods, true, 3)).toBe(2);
        expect(initialMobilePeriod(model.periods, true, 20)).toBe(4);
        expect(initialMobilePeriod(model.periods, true, null)).toBe(1);
        expect(initialMobilePeriod([], true, 2)).toBeNull();
    });
    test('distingue correquisitos e excluindo equivalências das conexões', () => {
        expect(
            model.edges
                .filter((e) => e.kind === 'prerequisite')
                .map((e) => [e.source, e.target, e.group, e.alternative])
        ).toEqual([
            ['A', 'B', 1, true],
            ['C', 'B', 2, true]
        ]);
        expect(
            model.edges.filter((e) => e.kind === 'corequisite').map((e) => [e.source, e.target])
        ).toEqual([['D', 'B']]);
        expect(model.edges.some((e) => e.source === 'E')).toBe(false);
    });
});
