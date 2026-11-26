import { expect, test } from 'bun:test';

import {
    formatInternshipDate,
    formatInternshipMoney,
    vacanciesLabel
} from '../../../src/queries/internships.ts';

test('formata valores monetários e ignora vazio, zero e inválido', () => {
    expect(formatInternshipMoney('1500.00')).toContain('1.500,00');
    expect(formatInternshipMoney(null)).toBeNull();
    expect(formatInternshipMoney(0)).toBeNull();
    expect(formatInternshipMoney('invalid')).toBeNull();
});

test('mostra o dia do calendário da UnB, sem converter o fuso', () => {
    expect(formatInternshipDate('2026-12-01T00:00:00')).toBe('01/12/2026');
    expect(formatInternshipDate('2026-12-01T23:30:00Z')).toBe('01/12/2026');
});

test('devolve o texto original quando não é uma data', () => {
    expect(formatInternshipDate('sem data')).toBe('sem data');
});

test('conta as vagas no singular e no plural', () => {
    expect(vacanciesLabel(1)).toBe('1 vaga');
    expect(vacanciesLabel(3)).toBe('3 vagas');
});
