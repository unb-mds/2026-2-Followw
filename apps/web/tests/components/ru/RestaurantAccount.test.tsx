import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { StatementDetails, StudentCard } from '#/components/ru/RestaurantAccount';

describe('StatementDetails', () => {
    test.each([
        ['Grupo 1 Almoço', 'Almoço'],
        ['Grupo2 Jantar', 'Jantar'],
        ['GRUPO 3 Café da manhã', 'Café da manhã'],
        ['Recarga', 'Recarga']
    ])('exibe apenas a refeição em %s', (description, label) => {
        const markup = renderToStaticMarkup(
            <StatementDetails
                statement={{
                    balance: '10.00',
                    group: 2,
                    entries: [
                        {
                            occurred_at: '2026-10-05T12:00:00-03:00',
                            description,
                            amount: '-5.20'
                        }
                    ]
                }}
            />
        );
        expect(markup).toContain(`>${label}</p>`);
    });

    test('mostra saldo zero, grupo e extrato com débitos e créditos', () => {
        const markup = renderToStaticMarkup(
            <StatementDetails
                statement={{
                    balance: '0.00',
                    group: 2,
                    entries: [
                        {
                            occurred_at: '2026-10-05T12:00:00-03:00',
                            description: 'Almoço',
                            amount: '-5.20'
                        },
                        {
                            occurred_at: '2026-10-05T09:00:00-03:00',
                            description: 'Recarga',
                            amount: '20.00'
                        }
                    ]
                }}
            />
        );
        expect(markup).toContain('0,00');
        expect(markup).toContain('Almoço');
        expect(markup).toContain('-R$');
        expect(markup).toContain('5,20');
        expect(markup).toContain('20,00');
        expect(markup).toContain('05/10/2026, 12:00');
    });

    test('explicita saldo/grupo ausentes e extrato vazio', () => {
        const markup = renderToStaticMarkup(
            <StatementDetails statement={{ balance: null, group: null, entries: [] }} />
        );
        expect(markup).toContain('Saldo não informado');
        expect(markup).toContain('Nenhuma movimentação');
    });
});

describe('StudentCard', () => {
    const credentials = { token: 'carteirinha-token', valid_until: '2026-10-01' };

    test('gera QR code local em SVG durante todo o mês de validade', () => {
        const markup = renderToStaticMarkup(
            <StudentCard credentials={credentials} date="2026-10-31" />
        );
        expect(markup).toContain('<svg');
        expect(markup).toContain('QR code da carteirinha estudantil');
        expect(markup).toContain('outubro de 2026');
        expect(markup).not.toContain('<img');
    });

    test('mostra aviso no lugar de QR code vencido', () => {
        const markup = renderToStaticMarkup(
            <StudentCard credentials={credentials} date="2026-11-01" />
        );
        expect(markup).toContain('Carteirinha vencida');
        expect(markup).not.toContain('<svg');
    });
});
