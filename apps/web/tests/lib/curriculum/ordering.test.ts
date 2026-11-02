import { describe, expect, test } from 'bun:test';

import { normalizeCurriculum } from '#/lib/curriculum/model';
import { orderColumns } from '#/lib/curriculum/ordering';

import { curriculum, type RawSubject } from '../../helpers/curriculum';

const flow = (...periods: RawSubject[][]) =>
    normalizeCurriculum(
        curriculum({
            sigaa_id: 1,
            code: '01',
            course_id: 42,
            entry_semester: '2024.2',
            valid_from: '2024.1',
            matrix: 'Ordem',
            shift: null,
            periods: periods.map((subjects, index) => ({ period: index + 1, subjects }))
        })
    );
const rows = (columns: { code: string }[][]) =>
    new Map(columns.flatMap((column) => column.map(({ code }, row) => [code, row] as const)));

// semestre ligado ao anterior com as posições embaralhadas
const shuffled = (offset: number): RawSubject[] =>
    Array.from({ length: 6 }, (_, index) => ({
        code: `P${offset}${index}`,
        name: 'Disciplina',
        prerequisites: offset ? [[`P${offset - 1}${(index * 5) % 6}`]] : null
    }));

describe('ordem das matérias no fluxo', () => {
    test('alinha a origem ao destino mesmo quando ela não tem pré-requisitos', () => {
        const model = flow(
            [
                { code: 'A', name: 'Primeira' },
                { code: 'B', name: 'Segunda' },
                { code: 'C', name: 'Origem' }
            ],
            [{ code: 'Z', name: 'Destino', prerequisites: [['C']] }]
        );
        const row = rows(orderColumns(model));
        expect(row.get('C')).toBe(row.get('Z'));
    });

    test('ordena os dois semestres para as linhas não se cruzarem', () => {
        const model = flow(
            [
                { code: 'A', name: 'Primeira' },
                { code: 'B', name: 'Segunda' }
            ],
            [
                { code: 'X', name: 'Depende de B', prerequisites: [['B']] },
                { code: 'Y', name: 'Depende de A', prerequisites: [['A']] }
            ]
        );
        const row = rows(orderColumns(model));
        expect(row.get('A')).toBe(row.get('Y'));
        expect(row.get('B')).toBe(row.get('X'));
    });

    test('mantém correquisitos juntos e cada matéria uma única vez no seu semestre', () => {
        const model = flow(
            [
                { code: 'A', name: 'Teoria', corequisites: [['D']] },
                { code: 'B', name: 'Outra' },
                { code: 'C', name: 'Mais uma' },
                { code: 'D', name: 'Prática', corequisites: [['A']] }
            ],
            [{ code: 'Z', name: 'Destino', prerequisites: [['B'], ['D']] }]
        );
        const columns = orderColumns(model);
        expect(columns.map((column) => column.map(({ code }) => code).toSorted())).toEqual([
            ['A', 'B', 'C', 'D'],
            ['Z']
        ]);
        const row = rows(columns);
        expect(Math.abs(row.get('A')! - row.get('D')!)).toBe(1);
    });

    test('repete a mesma ordem para o mesmo currículo', () => {
        const [first, second] = [0, 1].map(() =>
            orderColumns(flow(shuffled(0), shuffled(1), shuffled(2))).map((column) =>
                column.map(({ code }) => code)
            )
        );
        expect(first).toEqual(second);
    });
});
