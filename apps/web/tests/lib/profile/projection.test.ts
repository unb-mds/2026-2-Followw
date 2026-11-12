import { describe, expect, test } from 'bun:test';

import type { Classroom } from '#/queries/classrooms';
import type { UserProfile } from '#/queries/me';

import { projectedIntegralization } from '#/lib/profile';

const user = {
    integralization: 30,
    workload: {
        total: 1000,
        pending_mandatory: 500,
        pending_optional: 200,
        pending_complementary: 0,
        mandatory: null,
        optional: null,
        complementary: null
    }
} satisfies Pick<UserProfile, 'integralization' | 'workload'>;

function classroom(code: string, hours: number | null = 60): Classroom {
    return {
        id: code,
        number: '01',
        semester: '2026.2',
        current: true,
        status: 'cursando',
        subject: { code, name: code, hours },
        professors: []
    };
}

describe('projectedIntegralization', () => {
    test('soma as horas concluídas e das disciplinas atuais e calcula a proporção do curso', () => {
        expect(
            projectedIntegralization(user, [classroom('A', 60), classroom('B', 90)])
        ).toBeCloseTo(45);
    });

    test('conta a mesma disciplina uma vez mesmo com mais de uma turma', () => {
        expect(
            projectedIntegralization(user, [classroom('A'), { ...classroom('A'), id: 'outra' }])
        ).toBeCloseTo(36);
    });

    test('ignora semestres anteriores e matrículas não confirmadas ou encerradas', () => {
        const ignored: Classroom[] = [
            { ...classroom('ANTERIOR'), current: false },
            ...(['pending_enrollment', 'denied', 'trancado', 'concluido'] as const).map((status) =>
                Object.assign(classroom(status), { status })
            )
        ];
        expect(projectedIntegralization(user, [...ignored, classroom('ATUAL')])).toBeCloseTo(36);
    });

    test('usa turmas atuais sem status e ignora cargas horárias ausentes ou inválidas', () => {
        const unknown = [null, 0, -1, NaN, Infinity].map((hours, index) =>
            classroom(String(index), hours)
        );
        expect(projectedIntegralization(user, unknown)).toBeNull();
        expect(
            projectedIntegralization(user, [...unknown, { ...classroom('ATUAL'), status: null }])
        ).toBeCloseTo(36);
    });

    test('limita a previsão ao total de horas do curso', () => {
        expect(projectedIntegralization(user, [classroom('A', 900)])).toBe(100);
    });

    test('não projeta sem turmas, integralização ou carga total válida', () => {
        expect(projectedIntegralization(user, [])).toBeNull();
        expect(
            projectedIntegralization({ ...user, integralization: null }, [classroom('A')])
        ).toBeNull();
        expect(projectedIntegralization({ ...user, workload: null }, [classroom('A')])).toBeNull();
        expect(
            projectedIntegralization({ ...user, workload: { ...user.workload, total: 0 } }, [
                classroom('A')
            ])
        ).toBeNull();
    });
});
