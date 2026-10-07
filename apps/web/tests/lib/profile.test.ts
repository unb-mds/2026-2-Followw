import { describe, expect, test } from 'bun:test';

import { academicIndexes, creditsLabel, titleCase } from '#/lib/profile';

describe('titleCase', () => {
    test.each([
        ['NOME DISCENTE', 'Nome Discente'],
        ['JOÃO DOS SANTOS E SILVA', 'João dos Santos e Silva'],
        ['CIÊNCIA DA COMPUTAÇÃO', 'Ciência da Computação'],
        ['  ENGENHARIA   DE SOFTWARE ', 'Engenharia de Software'],
        ['DE ASSIS', 'De Assis'],
        ["MARIA-JOSÉ D'ÁVILA", "Maria-José D'Ávila"],
        ['CIÊNCIAS AMBIENTAIS (PROFISSIONAL)', 'Ciências Ambientais (Profissional)'],
        ['PEDRO DE ALCÂNTARA II', 'Pedro de Alcântara II'],
        ['VIVIANE XAVIER', 'Viviane Xavier']
    ])('formata %s', (text, expected) => {
        expect(titleCase(text)).toBe(expected);
    });
});

describe('academicIndexes', () => {
    test('formata IRA e MP com três casas no padrão brasileiro', () => {
        expect(academicIndexes({ ira: 3.5, mp: 4.12345 }).map((index) => index.value)).toEqual([
            '3,500',
            '4,123'
        ]);
    });

    test('omite índices ausentes mas mantém zero', () => {
        expect(academicIndexes({ ira: null, mp: 0 })).toEqual([
            { label: 'MP', description: 'Média ponderada', value: '0,000' }
        ]);
        expect(academicIndexes({ ira: null, mp: null })).toEqual([]);
    });
});

describe('creditsLabel', () => {
    test('converte horas em créditos (15 h = 1 crédito)', () => {
        expect(creditsLabel(15)).toBe('1 crédito');
        expect(creditsLabel(2175)).toBe('145 créditos');
        expect(creditsLabel(0)).toBe('0 créditos');
        expect(creditsLabel(20)).toBe('1,3 créditos');
    });
});
