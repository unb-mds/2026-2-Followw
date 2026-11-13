import { describe, expect, test } from 'bun:test';

import type { Classroom } from '#/queries/classrooms';
import type { UserProfile } from '#/queries/me';

import { projectedCategoryHours, projectedIntegralization } from '#/lib/profile';

import { classroom } from './helpers';

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

function project(
    profile: Pick<UserProfile, 'integralization' | 'workload'>,
    classrooms: Classroom[]
) {
    return projectedIntegralization(profile, projectedCategoryHours(classrooms));
}

describe('projectedIntegralization', () => {
    test('soma as horas concluídas e das disciplinas atuais e calcula a proporção do curso', () => {
        expect(
            project(user, [classroom('A', 60, 'mandatory'), classroom('B', 90, 'optional')])
        ).toBeCloseTo(45);
    });

    test('conta a mesma disciplina uma vez mesmo com mais de uma turma', () => {
        expect(
            project(user, [
                classroom('A', 60, 'mandatory'),
                { ...classroom('A', 60, 'mandatory'), id: 'outra' }
            ])
        ).toBeCloseTo(36);
    });

    test('ignora semestres anteriores e matrículas não confirmadas ou encerradas', () => {
        const ignored: Classroom[] = [
            { ...classroom('ANTERIOR', 60, 'mandatory'), current: false },
            ...(['pending_enrollment', 'denied', 'trancado', 'concluido'] as const).map((status) =>
                Object.assign(classroom(status, 60, 'mandatory'), { status })
            )
        ];
        expect(project(user, [...ignored, classroom('ATUAL', 60, 'mandatory')])).toBeCloseTo(36);
    });

    test('usa turmas atuais sem status e ignora cargas horárias ausentes ou inválidas', () => {
        const unknown = [null, 0, -1, NaN, Infinity].map((hours, index) =>
            classroom(String(index), hours, 'mandatory')
        );
        expect(project(user, unknown)).toBeNull();
        expect(
            project(user, [...unknown, { ...classroom('ATUAL', 60, 'mandatory'), status: null }])
        ).toBeCloseTo(36);
    });

    test('limita optativas à pendência sem transferir excedente para obrigatórias', () => {
        expect(
            project(user, [classroom('OBR', 60, 'mandatory'), classroom('OPT', 900, 'optional')])
        ).toBeCloseTo(56);
    });

    test('limita obrigatórias à pendência e mantém as optativas separadas', () => {
        expect(project(user, [classroom('OBR', 900, 'mandatory')])).toBeCloseTo(80);
    });

    test('ignora optativa com carga cumprida, módulo livre e disciplina sem classificação', () => {
        expect(
            project({ ...user, workload: { ...user.workload, pending_optional: 0 } }, [
                classroom('OPT', 60, 'optional'),
                classroom('LIVRE', 60, 'free'),
                classroom('SEM', 60, null)
            ])
        ).toBeNull();
    });

    test('não projeta sem turmas, integralização ou carga total válida', () => {
        expect(project(user, [])).toBeNull();
        expect(
            project({ ...user, integralization: null }, [classroom('A', 60, 'mandatory')])
        ).toBeNull();
        expect(project({ ...user, workload: null }, [classroom('A', 60, 'mandatory')])).toBeNull();
        expect(
            project({ ...user, workload: { ...user.workload, total: 0 } }, [
                classroom('A', 60, 'mandatory')
            ])
        ).toBeNull();
    });
});
