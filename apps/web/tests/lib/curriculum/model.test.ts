import { describe, expect, test } from 'bun:test';

import type { Classroom } from '#/queries/classrooms';
import type { CourseCurriculum } from '#/queries/curriculum';

import {
    academicContext,
    creditText,
    initialMobilePeriod,
    normalizeCurriculum,
    requirementsText
} from '#/lib/curriculum/model';

export const matrix: CourseCurriculum = {
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
const model = normalizeCurriculum(matrix);
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
    test('oculta matérias sem nome e suas linhas sem remover requisitos ou matérias com nome e carga ausente', () => {
        const data: CourseCurriculum = {
            ...matrix,
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
        };
        const visible = normalizeCurriculum(data);
        expect(visible.subjects.map((subject) => subject.code)).toEqual(['A', 'E']);
        expect([...visible.byCode.keys()]).toEqual(['A', 'E']);
        expect(visible.edges.map((edge) => [edge.source, edge.target])).toEqual([['A', 'E']]);
        expect(visible.byCode.get('E')!.prerequisites).toEqual([['B', 'A']]);
        expect(data.periods[0].subjects).toHaveLength(5);
        data.periods[0].subjects[1].name = 'Dados disponíveis';
        expect(normalizeCurriculum(data).byCode.has('B')).toBe(true);
    });
    test('aprovação prevalece sobre matrícula e atraso inclui o semestre atual', () => {
        const context = academicContext(
            [
                classroom('A', 'concluido', 'MM'),
                classroom('A', 'cursando'),
                classroom('C', 'cursando')
            ],
            2
        );
        expect(model.subjects.map(context.state)).toEqual([
            'completed',
            'enrolled',
            'overdue',
            'pending'
        ]);
    });
    test('sem histórico o estado é desconhecido; sem período não inventa atraso', () => {
        expect(model.subjects.map(academicContext(undefined, 4).state)).toEqual([
            'unknown',
            'unknown',
            'unknown',
            'unknown'
        ]);
        expect(model.subjects.map(academicContext([], null).state)).toEqual([
            'pending',
            'pending',
            'pending',
            'pending'
        ]);
        expect(
            academicContext([classroom('A', 'concluido', 'MI')], 1).state(model.byCode.get('A')!)
        ).toBe('overdue');
    });
    test('identifica matrícula em curso da selecionada mesmo havendo aprovação', () => {
        const context = academicContext(
            [
                classroom('A', 'concluido', 'SS'),
                classroom('B', 'cursando'),
                classroom('C', 'trancado')
            ],
            2
        );
        expect(context.isEnrolled('A')).toBe(false);
        expect(context.isEnrolled('B')).toBe(true);
        expect(context.isEnrolled('C')).toBe(false);
        expect(context.isEnrolled('D')).toBe(false);
        expect(context.isEnrolled(undefined)).toBe(false);
        expect(academicContext(undefined, 2).isEnrolled('B')).toBe(false);
        expect(
            academicContext(
                [classroom('A', 'cursando'), classroom('A', 'concluido', 'SS')],
                2
            ).isEnrolled('A')
        ).toBe(true);
    });
    test('abre mobile no período atual do curso do aluno e no primeiro para outros cursos', () => {
        expect(initialMobilePeriod(model.periods, true, 2)).toBe(2);
        expect(initialMobilePeriod(model.periods, false, 2)).toBe(1);
        expect(initialMobilePeriod(model.periods, true, 3)).toBe(2);
        expect(initialMobilePeriod(model.periods, true, 20)).toBe(4);
        expect(initialMobilePeriod(model.periods, true, null)).toBe(1);
        expect(initialMobilePeriod([], true, 2)).toBeNull();
    });
    test('divide horas por quinze, mantém frações e ausência de informação', () => {
        expect(creditText(60)).toBe('4 créditos');
        expect(creditText(15)).toBe('1 crédito');
        expect(creditText(22.5)).toBe('1,5 créditos');
        expect(creditText(20)).toBe('1,3333333333 créditos');
        expect(creditText(0)).toBe('0 créditos');
        expect(creditText(null)).toBe('Créditos indisponíveis');
        expect(creditText(60, 'short')).toBe('4 cr');
        expect(creditText(15, 'short')).toBe('1 cr');
        expect(creditText(22.5, 'short')).toBe('1,5 cr');
        expect(creditText(0, 'short')).toBe('0 cr');
        expect(creditText(null, 'short')).toBe('Créditos indisponíveis');
    });
    test('preserva E e OU, distinguindo correquisitos e excluindo equivalências das conexões', () => {
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
        const names = new Map([
            ['A', 'Base'],
            ['EXTERNA', 'Fundamentos'],
            ['C', 'Alternativa']
        ]);
        expect(requirementsText(model.byCode.get('B')!.prerequisites, names)).toBe(
            '(Base e Fundamentos) ou Alternativa'
        );
        expect(requirementsText(null, names)).toBeNull();
        expect(requirementsText([[], ['DESCONHECIDA']], names)).toBeNull();
        expect(requirementsText([['A', 'DESCONHECIDA'], ['C']], names)).toBe('Alternativa');
    });
});
