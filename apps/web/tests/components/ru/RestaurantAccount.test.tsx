import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import {
    RestaurantAccount,
    StatementDetails,
    StudentCard
} from '#/components/ru/RestaurantAccount';
import { credentialsQueryOptions } from '#/queries/restaurant-account';

describe('RestaurantAccount', () => {
    test('oferece botão para abrir o QR code em um drawer sem exibi-lo na página', () => {
        const queryClient = new QueryClient();
        const registration = '202600001';
        queryClient.setQueryData(credentialsQueryOptions(registration).queryKey, {
            token: 'carteirinha-token',
            valid_until: '2026-10-01'
        });

        const markup = renderToStaticMarkup(
            <QueryClientProvider client={queryClient}>
                <RestaurantAccount registration={registration} />
            </QueryClientProvider>
        );

        expect(markup).toMatch(
            /<button\b(?=[^>]*aria-haspopup="dialog")(?=[^>]*aria-label="Ver QR code da carteirinha")[^>]*>/
        );
        expect(markup).toContain('aria-expanded="false"');
        expect(markup).not.toContain('QR code da carteirinha estudantil');
        expect(markup).not.toContain('carteirinha-token');
    });
});

describe('StatementDetails', () => {
    test('avisa sobre o preço e o valor faltante para a refeição atual ou próxima', () => {
        const markup = renderToStaticMarkup(
            <StatementDetails
                now={{ date: '2026-10-05', weekday: 1, time: '09:30' }}
                statement={{ balance: '4.49', group: 2, entries: [] }}
            />
        );
        expect(markup).toContain('Saldo insuficiente para o almoço.');
        expect(markup).toContain('4,50');
        expect(markup).toContain('0,01');
    });

    test('usa os preços do Grupo 4 no aviso', () => {
        const markup = renderToStaticMarkup(
            <StatementDetails
                now={{ date: '2026-10-05', weekday: 1, time: '08:00' }}
                statement={{ balance: '1.00', group: 4, entries: [] }}
            />
        );
        expect(markup).toContain('Saldo insuficiente para o café da manhã.');
        expect(markup).toContain('1,50');
        expect(markup).toContain('0,50');
    });

    test.each([
        { balance: '-1.00', group: 1 },
        { balance: '4.50', group: 2 },
        { balance: '2.50', group: 4 },
        { balance: null, group: 2 },
        { balance: '0.00', group: null }
    ] as const)('não avisa com isenção, saldo suficiente ou dados ausentes: %j', (account) => {
        const markup = renderToStaticMarkup(
            <StatementDetails
                now={{ date: '2026-10-05', weekday: 1, time: '12:00' }}
                statement={{ ...account, entries: [] }}
            />
        );
        expect(markup).not.toContain('Saldo insuficiente');
    });

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
