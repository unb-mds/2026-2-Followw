import type { Classroom } from '@followw/core/queries/classrooms.ts';

import { groupBySemester } from '@followw/core/lib/classroom-details.ts';
import { expect, test } from 'bun:test';

import { simulateIndexes, simulationClassrooms, simulationKey } from '#/lib/academic-simulation';

function turma(
    code: string,
    semester: string,
    grade: Classroom['grade'],
    hours: number | null = 60
): Classroom {
    return {
        id: `${code}-${semester}`,
        semester,
        current: false,
        number: '01',
        subject: { code, name: code, hours },
        professors: [],
        grade
    };
}

test('pondera o IRA pelo semestre até seis e exclui módulo livre somente da MP', () => {
    const primeira = turma('A', '2023.1', 'SS', 30);
    const eletiva = turma('B', '2026.1', 'SR');
    const atual = turma('A', '2026.2', null);
    const semestres = groupBySemester([primeira, eletiva, atual]);
    const matriz = new Set(['A']);
    const oficial = simulateIndexes(semestres, '2023.1', '2026.2', matriz, {});
    expect(oficial.ira).toBeCloseTo(150 / 390);
    expect(oficial.mp).toBe(5);
    expect(oficial.evolution.map(({ semester }) => semester)).toEqual(['2023.1', '2026.1']);

    const simulado = simulateIndexes(semestres, '2023.1', '2026.2', matriz, {
        [simulationKey(primeira)]: 'MM',
        [simulationKey(atual)]: 'MS'
    });
    expect(simulado.ira).toBeCloseTo(1530 / 750);
    expect(simulado.mp).toBeCloseTo(330 / 90);
    expect(simulado.evolution).toEqual([
        { semester: '2023.1', ira: 3, projected: false },
        { semester: '2026.1', ira: 90 / 390, projected: false },
        { semester: '2026.2', ira: 1530 / 750, projected: true }
    ]);
});

test('ignora carga ausente e distingue SR de disciplina sem menção', () => {
    const atual = { ...turma('A', '2026.2', 'SR'), current: true };
    const semestres = groupBySemester([atual, turma('B', '2026.2', 'SS', null)]);
    const inicial = simulateIndexes(semestres, '2026.2', '2026.2', null, {});
    expect(inicial).toEqual({
        ira: 0,
        mp: null,
        evolution: [{ semester: '2026.2', ira: 0, projected: true }]
    });
    expect(
        simulateIndexes(semestres, '2026.2', '2026.2', null, {
            [simulationKey(atual)]: null
        })
    ).toEqual({ ira: null, mp: null, evolution: [] });
});

test('filtra vínculos fora da simulação e usa uma linha por matéria e semestre', () => {
    const matriculada = turma('A', '2026.2', 'MS');
    expect(
        simulationClassrooms(
            [
                turma('A', '2026.1', 'SS'),
                turma('A', '2026.2', null),
                matriculada,
                { ...turma('B', '2026.2', null), status: 'trancado' },
                { ...turma('C', '2026.2', null), status: 'pending_enrollment' },
                turma('A', '2027.1', null)
            ],
            '2026.2',
            '2026.2'
        )
    ).toEqual([matriculada]);
});
