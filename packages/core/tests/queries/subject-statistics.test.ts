import { expect, test } from 'bun:test';

import { shareLabel, situationLabels } from '../../src/queries/subject-statistics.ts';

test('formata a fatia com até duas casas', () => {
    expect(shareLabel(33.333)).toBe('33,33%');
    expect(shareLabel(50)).toBe('50%');
});

test('nomeia as situações do SIGAA', () => {
    expect(situationLabels.reprovado_por_media_e_por_faltas).toBe('Reprovado por média e faltas');
});
