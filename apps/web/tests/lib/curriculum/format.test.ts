import { describe, expect, test } from 'bun:test';

import type { FlowEdge } from '#/lib/curriculum/types';
import type { Requirements } from '#/queries/subjects';

import { creditText, edgeLabel, requirementsText } from '#/lib/curriculum/format';
import { normalizeCurriculum } from '#/lib/curriculum/model';

import { curriculum } from '../../helpers/curriculum';

const requirements = (groups: [string, string | null][][]): Requirements =>
    groups.map((group) =>
        group.map(([code, name]) => ({ code, subject: name ? { code, name } : null }))
    );

describe('textos do fluxo', () => {
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
    test('preserva E e OU e descarta grupos com matéria sem nome no catálogo', () => {
        expect(
            requirementsText(
                requirements([
                    [
                        ['A', 'BASE'],
                        ['EXTERNA', 'FUNDAMENTOS']
                    ],
                    [['C', 'ALTERNATIVA']]
                ])
            )
        ).toBe('(Base e Fundamentos) ou Alternativa');
        expect(requirementsText(null)).toBeNull();
        expect(requirementsText(requirements([[], [['DESCONHECIDA', null]]]))).toBeNull();
        expect(
            requirementsText(
                requirements([
                    [
                        ['A', 'BASE'],
                        ['DESCONHECIDA', null]
                    ],
                    [['C', 'ALTERNATIVA']]
                ])
            )
        ).toBe('Alternativa');
    });
    test('descreve a relação com os semestres e o grupo alternativo', () => {
        const { byCode } = normalizeCurriculum(
            curriculum({
                sigaa_id: 1,
                code: '01',
                course_id: 42,
                entry_semester: '2024.2',
                valid_from: '2024.1',
                matrix: 'Teste',
                shift: null,
                periods: [
                    { period: 1, subjects: [{ code: 'A', name: 'Base' }] },
                    { period: 2, subjects: [{ code: 'B', name: 'Avançada' }] }
                ]
            })
        );
        const edge: FlowEdge = {
            id: 'e',
            kind: 'prerequisite',
            source: 'A',
            target: 'B',
            group: 2,
            alternative: true
        };
        expect(edgeLabel(edge, byCode)).toBe(
            'A (1º semestre) → B (2º semestre): pré-requisito; alternativa 2; E dentro do grupo, OU entre grupos'
        );
        expect(edgeLabel({ ...edge, kind: 'corequisite', alternative: false }, byCode)).toBe(
            'A (1º semestre) ↔ B (2º semestre): correquisito (cursar em conjunto)'
        );
    });
});
