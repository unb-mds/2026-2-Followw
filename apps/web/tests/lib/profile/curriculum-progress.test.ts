import { describe, expect, test } from 'bun:test';

import { curriculumProgress } from '#/lib/profile';

const workload = {
    total: 3525,
    pending_mandatory: 1935,
    pending_optional: 480,
    pending_complementary: 0,
    mandatory: null,
    optional: null,
    complementary: null
};

describe('curriculumProgress', () => {
    test('calcula as horas concluídas a partir do total e de todas as pendências', () => {
        expect(curriculumProgress(workload)).toEqual({
            total: 3525,
            pending: 2415,
            completed: 1110
        });
        expect(curriculumProgress({ ...workload, pending_complementary: 90 })).toEqual({
            total: 3525,
            pending: 2505,
            completed: 1020
        });
    });

    test('preserva zero para curso concluído ou ainda sem horas concluídas', () => {
        expect(
            curriculumProgress({ ...workload, pending_mandatory: 0, pending_optional: 0 })
        ).toEqual({ total: 3525, pending: 0, completed: 3525 });
        expect(curriculumProgress({ ...workload, total: 2415 })).toEqual({
            total: 2415,
            pending: 2415,
            completed: 0
        });
    });

    test('não calcula conclusão sem carga horária ou com pendências acima do total', () => {
        expect(curriculumProgress(null)).toBeNull();
        expect(curriculumProgress({ ...workload, total: 100 })).toBeNull();
    });

    test.each([-1, NaN, Infinity])('não calcula conclusão com carga inválida: %s', (hours) => {
        for (const key of [
            'total',
            'pending_mandatory',
            'pending_optional',
            'pending_complementary'
        ])
            expect(curriculumProgress({ ...workload, [key]: hours })).toBeNull();
    });
});
