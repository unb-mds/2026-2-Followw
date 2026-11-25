import type { Middleware } from 'openapi-fetch';

import { apiClient } from '@followw/core/queries/client.ts';
import { credentialsQueryOptions } from '@followw/core/queries/restaurant-account.ts';
import { noop, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, mock, setSystemTime, test } from 'bun:test';
import { useLayoutEffect } from 'react';

import { RestaurantAccount } from '#/components/ru/RestaurantAccount';
import { clearSession } from '#/queries/auth';

import { useDom } from '../../helpers/dom';

const dom = useDom();
const NOW = new Date('2026-11-24T15:00:00Z');
const STATEMENT = { balance: '10.00', group: 2 as const, entries: [] };

const alwaysClient = () =>
    new QueryClient({ defaultOptions: { queries: { retry: false, networkMode: 'always' } } });

async function openDrawer(client: QueryClient, registration: string) {
    const view = dom.testing.render(
        <QueryClientProvider client={client}>
            <RestaurantAccount registration={registration} consumeCardRequest={noop} />
        </QueryClientProvider>
    );
    const dialog = await view.findByRole('dialog', { name: 'Carteirinha estudantil' });
    return { view, dialog };
}

describe('StudentCardDrawer', () => {
    let originalIsoLayoutEffect: typeof useLayoutEffect;

    beforeEach(async () => {
        setSystemTime(NOW);
        const mod = await import('@base-ui/utils/useIsoLayoutEffect');
        originalIsoLayoutEffect = mod.useIsoLayoutEffect;
        await mock.module('@base-ui/utils/useIsoLayoutEffect', () => ({
            useIsoLayoutEffect: useLayoutEffect
        }));
    });

    afterEach(async () => {
        dom.testing.cleanup();
        setSystemTime();
        await mock.module('@base-ui/utils/useIsoLayoutEffect', () => ({
            useIsoLayoutEffect: originalIsoLayoutEffect
        }));
    });

    test('oferece tentar novamente quando falha sem carteirinha salva e carrega ao retentar', async () => {
        const registration = '202655555';
        const card = { token: 'qr-carregado', valid_until: '2027-03-01' };
        let shouldFail = true;
        const middleware: Middleware = {
            onRequest: ({ request }) => {
                if (new URL(request.url).pathname === '/api/me/ru-token') {
                    if (shouldFail) throw new TypeError('Sem conexão');
                    return Response.json(card);
                }
                return Response.json(STATEMENT);
            }
        };
        apiClient.use(middleware);
        const client = alwaysClient();
        try {
            const { view } = await openDrawer(client, registration);
            const currentDialog = () =>
                view.getByRole('dialog', { name: 'Carteirinha estudantil' });
            await dom.testing.waitFor(() =>
                expect(currentDialog().textContent).toContain(
                    'Não foi possível carregar carteirinha.'
                )
            );

            shouldFail = false;
            dom.testing.fireEvent.click(view.getByRole('button', { name: 'Tentar novamente' }));
            await dom.testing.waitFor(() =>
                expect(currentDialog().querySelector('svg title')?.textContent).toBe(
                    'QR code da carteirinha estudantil'
                )
            );
            expect(currentDialog().textContent).not.toContain('Tentar novamente');
            view.unmount();
        } finally {
            await clearSession(client);
            apiClient.eject(middleware);
        }
    });

    test('reabre a carteirinha válida antiga sem consultar a rede nem exibir erro', async () => {
        const registration = '202633333';
        const card = { token: 'qr-valido-antigo', valid_until: '2027-03-01' };
        let tokenRequests = 0;
        const middleware: Middleware = {
            onRequest: ({ request }) => {
                if (new URL(request.url).pathname === '/api/me/ru-token') {
                    tokenRequests++;
                    throw new TypeError('Sem conexão');
                }
                return Response.json(STATEMENT);
            }
        };
        apiClient.use(middleware);
        const seed = new QueryClient({
            defaultOptions: { queries: { enabled: false, retry: false } }
        });
        seed.setQueryData(credentialsQueryOptions(registration).queryKey, card, {
            updatedAt: Date.now() - 30 * 86400000
        });
        dom.testing
            .render(
                <QueryClientProvider client={seed}>
                    <RestaurantAccount registration={registration} />
                </QueryClientProvider>
            )
            .unmount();

        const client = alwaysClient();
        try {
            const { view, dialog } = await openDrawer(client, registration);
            expect(dialog.querySelector('svg title')?.textContent).toBe(
                'QR code da carteirinha estudantil'
            );
            expect(tokenRequests).toBe(0);
            expect(dialog.textContent).not.toContain('Não foi possível');
            expect(dialog.textContent).not.toContain('Tentar novamente');
            view.unmount();
        } finally {
            await clearSession(client);
            apiClient.eject(middleware);
        }
    });
});
