import { expect, test } from 'bun:test';

import { estimatedProgress } from '../../../src/lib/curriculum/progress.ts';
import { curriculum } from '../../helpers/curriculum';
import { classroom } from '../profile/helpers';

const matrix = curriculum({
    course_id: 2,
    sigaa_id: 3,
    code: 'DESTINO',
    entry_semester: '2026.2',
    valid_from: '2026.1',
    matrix: 'Destino',
    shift: null,
    total_workload: 240,
    required_workload: 90,
    optional_min_workload: 120,
    complementary_min_workload: 30,
    elective_max_workload: 45,
    periods: [
        { period: 1, subjects: [{ code: 'OBR', hours: 90, equivalences: [['A', 'B']] }] },
        { period: 0, subjects: [{ code: 'OPT', hours: 90 }] }
    ],
    complementary: [{ code: 'COMP', hours: 60 }]
});

test('limita complementares e preenche apenas o saldo optativo com módulo livre', () => {
    const approved = { ...classroom('LIVRE', 60), grade: 'MS' as const };
    const result = estimatedProgress(matrix, [approved, approved], ['OPT', 'COMP']);
    expect(result).toEqual({ completed: 150, total: 240, percentage: 62.5 });
});

test('respeita o teto eletivo e aproveita as horas de CUMP sem turma', () => {
    expect(estimatedProgress(matrix, [], ['LIVRE'], { LIVRE: 90 })?.completed).toBe(45);
});

test('consome o grupo completo de equivalências uma vez e exclui reprovações e matrículas', () => {
    const history = [classroom('OPT'), { ...classroom('COMP'), grade: 'MI' as const }];
    expect(estimatedProgress(matrix, history, ['A', 'B'], { A: 60, B: 30 })?.completed).toBe(90);
    expect(estimatedProgress(matrix, history, ['A'], { A: 30 })?.completed).toBe(30);
});

test('distingue histórico vazio de matriz sem carga publicada', () => {
    expect(estimatedProgress(matrix, [])?.completed).toBe(0);
    expect(estimatedProgress({ ...matrix, total_workload: null }, [])).toBeNull();
});
