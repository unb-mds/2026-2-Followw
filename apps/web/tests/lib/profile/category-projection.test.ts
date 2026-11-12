import { describe, expect, test } from 'bun:test';

import { projectedCategoryHours } from '#/lib/profile';

import { classroom } from './helpers';

describe('projectedCategoryHours', () => {
    test('soma as horas das disciplinas atuais por tipo na matriz', () => {
        expect(
            projectedCategoryHours([
                classroom('A', 60, 'mandatory'),
                classroom('B', 90, 'mandatory'),
                classroom('C', 30, 'optional')
            ])
        ).toEqual({ mandatory: 150, optional: 30 });
    });

    test('ignora módulo livre e disciplinas sem tipo conhecido', () => {
        expect(
            projectedCategoryHours([classroom('LIVRE', 60, 'free'), classroom('SEM', 60, null)])
        ).toEqual({ mandatory: 0, optional: 0 });
    });

    test('aplica os mesmos filtros da previsão de integralização', () => {
        expect(
            projectedCategoryHours([
                classroom('A', 60, 'mandatory'),
                { ...classroom('A', 60, 'mandatory'), id: 'outra' },
                { ...classroom('ANTIGA', 60, 'mandatory'), current: false },
                { ...classroom('TRANCADA', 60, 'optional'), status: 'trancado' },
                classroom('SEM_CARGA', null, 'optional')
            ])
        ).toEqual({ mandatory: 60, optional: 0 });
    });
});
