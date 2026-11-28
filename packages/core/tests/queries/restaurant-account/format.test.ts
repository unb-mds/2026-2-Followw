import { expect, test } from 'bun:test';

import {
    formatBalance,
    formatCardValidity,
    formatStatementTime
} from '../../../src/queries/restaurant-account.ts';

test('formata o saldo em reais a partir do texto da API', () => {
    expect(formatBalance('12.5')).toBe('R$ 12,50');
});

test('mostra o horário do extrato no fuso de Brasília', () => {
    expect(formatStatementTime('2026-03-10T15:30:00Z')).toBe('10/03/2026, 12:30');
});

test('mostra a validade da carteirinha pelo mês, sem mudar de dia com o fuso', () => {
    expect(formatCardValidity('2026-12-01')).toBe('dezembro de 2026');
});
