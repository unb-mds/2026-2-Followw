import type { Middleware } from 'openapi-fetch';

import { apiClient } from '@followw/core/queries/client.ts';
import { credentialsQueryOptions } from '@followw/core/queries/restaurant-account.ts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, mock, setSystemTime, test } from 'bun:test';

import { localStorageRepository, STORAGE_KEYS, STORAGE_PREFIX } from '#/lib/local-storage';
import { clearSession } from '#/queries/auth';
import { refreshQuery } from '#/queries/refresh';
import { useStudentCard } from '#/queries/student-card';

import { useDom } from '../helpers/dom';

const dom = useDom();
const NOW = new Date('2026-11-24T15:00:00Z');

const disabledClient = () =>
    new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } });

function mountCard(registration: string, client: QueryClient) {
    return dom.testing.renderHook(() => useStudentCard(registration), {
        wrapper: ({ children }) => (
            <QueryClientProvider client={client}>{children}</QueryClientProvider>
        )
    });
}

function emitCardStorage() {
    dom.testing.act(() => {
        window.dispatchEvent(
            new window.StorageEvent('storage', {
                key: `${STORAGE_PREFIX}${STORAGE_KEYS.STUDENT_CARD}`
            })
        );
    });
}

describe('useStudentCard', () => {
    beforeEach(() => setSystemTime(NOW));
    afterEach(() => setSystemTime());

    test('reabre a carteirinha válida sem consultar a rede após perder o cache geral', async () => {
        const registration = '202611111';
        const options = credentialsQueryOptions(registration);
        const card = { token: 'qr-salvo', valid_until: '2027-03-01' };
        const offline = mock(async () => {
            throw new TypeError('Sem conexão');
        });
        function open(reg: string, previouslyLoaded = false) {
            const client = disabledClient();
            const { queryKey } = credentialsQueryOptions(reg);
            client.setQueryDefaults(queryKey, { enabled: true });
            if (previouslyLoaded)
                client.setQueryData(queryKey, card, { updatedAt: Date.now() - 30 * 86400000 });
            return { client, view: mountCard(reg, client) };
        }

        open(registration, true).view.unmount();
        const { client, view } = open(registration);
        expect(client.getQueryData(options.queryKey)).toEqual(card);
        expect(await client.query({ ...options, queryFn: offline })).toEqual(card);
        expect(offline).not.toHaveBeenCalled();
        view.unmount();

        const other = open('outra-matricula');
        expect(
            other.client.getQueryData(credentialsQueryOptions('outra-matricula').queryKey)
        ).toBeUndefined();
        other.view.unmount();

        await clearSession(client);
        expect(open(registration).client.getQueryData(options.queryKey)).toBeUndefined();
    });

    test('ignora registro malformado no armazenamento local sem quebrar a renderização', () => {
        const registration = '202677777';
        const options = credentialsQueryOptions(registration);
        const card = { token: 'qr-cache', valid_until: '2027-03-01' };
        localStorageRepository.set(STORAGE_KEYS.STUDENT_CARD, {
            registration,
            credentials: null,
            updatedAt: Date.now()
        });
        const client = disabledClient();
        client.setQueryData(options.queryKey, card);
        const view = mountCard(registration, client);
        expect(view.result.current.data).toEqual(card);
        view.unmount();
    });

    test('preserva e promove o QR renovado no armazenamento local quando o cache geral tem uma cópia mais antiga', async () => {
        const registration = '202666666';
        const options = credentialsQueryOptions(registration);
        const oldCard = { token: 'qr-antigo', valid_until: '2027-03-01' };
        const renewedCard = { token: 'qr-renovado', valid_until: '2027-03-01' };
        const renewedAt = Date.now() - 86400000;
        let tokenRequests = 0;
        const middleware: Middleware = {
            onRequest: ({ request }) => {
                if (new URL(request.url).pathname === '/api/me/ru-token') tokenRequests++;
                return Response.json(oldCard);
            }
        };
        apiClient.use(middleware);

        const newerClient = disabledClient();
        newerClient.setQueryData(options.queryKey, renewedCard, { updatedAt: renewedAt });
        mountCard(registration, newerClient).unmount();

        const staleCacheClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        staleCacheClient.setQueryData(options.queryKey, oldCard, {
            updatedAt: Date.now() - 10 * 86400000
        });
        try {
            const view = mountCard(registration, staleCacheClient);
            await dom.testing.waitFor(() => expect(view.result.current.data).toEqual(renewedCard));
            expect(staleCacheClient.getQueryState(options.queryKey)?.dataUpdatedAt).toBe(renewedAt);
            expect(tokenRequests).toBe(0);
            view.unmount();

            const freshClient = disabledClient();
            mountCard(registration, freshClient).unmount();
            expect(freshClient.getQueryData(options.queryKey)).toEqual(renewedCard);
        } finally {
            await clearSession(staleCacheClient);
            apiClient.eject(middleware);
        }
    });

    test('busca a carteirinha de novo quando outra aba registrou o vencimento', async () => {
        const registration = '202688888';
        const options = credentialsQueryOptions(registration);
        const renewed = { token: 'qr-renovado', valid_until: '2028-03-01' };
        let tokenRequests = 0;
        const middleware: Middleware = {
            onRequest: () => {
                tokenRequests++;
                return Response.json(renewed);
            }
        };
        apiClient.use(middleware);
        localStorageRepository.set(STORAGE_KEYS.STUDENT_CARD, {
            registration,
            updatedAt: Date.now()
        });
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        client.setQueryData(
            options.queryKey,
            { token: 'qr-antigo', valid_until: '2027-03-01' },
            { updatedAt: Date.now() - 86400000 }
        );
        try {
            const view = mountCard(registration, client);
            await dom.testing.waitFor(() => expect(view.result.current.data).toEqual(renewed));
            expect(tokenRequests).toBe(1);
            view.unmount();
        } finally {
            await clearSession(client);
            apiClient.eject(middleware);
        }
    });

    test('preserva o fetch em andamento ao chegar marcador de vencimento e descarta se a resposta devolver o mesmo QR', async () => {
        const registration = '202699999';
        const options = credentialsQueryOptions(registration);
        const stale = { token: 'qr-antigo', valid_until: '2027-03-01' };
        const renewed = { token: 'qr-renovado', valid_until: '2028-03-01' };
        const resolvers: ((response: Response) => void)[] = [];
        const signals: AbortSignal[] = [];
        const middleware: Middleware = {
            onRequest: ({ request }) => {
                signals.push(request.signal);
                return new Promise<Response>((resolve) => {
                    resolvers.push(resolve);
                });
            }
        };
        apiClient.use(middleware);
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        client.setQueryData(options.queryKey, stale, { updatedAt: Date.now() - 86400000 });
        try {
            const view = mountCard(registration, client);
            const inFlight = refreshQuery(client, options, { retry: false });
            await dom.testing.waitFor(() => expect(resolvers).toHaveLength(1));

            localStorageRepository.set(STORAGE_KEYS.STUDENT_CARD, {
                registration,
                updatedAt: Date.now()
            });
            emitCardStorage();

            await dom.testing.waitFor(() => expect(view.result.current.data).toBeUndefined());
            expect(view.result.current.isFetching).toBe(true);
            expect(signals[0].aborted).toBe(false);
            expect(resolvers).toHaveLength(1);

            // resposta atrasada com o mesmo token invalidado é descartada e dispara nova busca
            resolvers[0](Response.json(stale));
            await inFlight;
            await dom.testing.waitFor(() => expect(resolvers).toHaveLength(2));
            expect(view.result.current.data).toBeUndefined();
            expect(
                localStorageRepository.get<Record<string, unknown>>(STORAGE_KEYS.STUDENT_CARD)
                    ?.credentials
            ).toBeUndefined();

            resolvers[1](Response.json(renewed));
            await dom.testing.waitFor(() => expect(view.result.current.data).toEqual(renewed));
            expect(view.result.current.isFetching).toBe(false);
            view.unmount();
        } finally {
            await clearSession(client);
            apiClient.eject(middleware);
        }
    });

    test('não regrava a carteirinha no armazenamento local após logout em outra aba', () => {
        const registration = '202612345';
        const options = credentialsQueryOptions(registration);
        const card = { token: 'qr-sessao', valid_until: '2027-03-01' };
        const client = disabledClient();
        client.setQueryData(options.queryKey, card, { updatedAt: Date.now() - 86400000 });
        const view = mountCard(registration, client);
        expect(localStorageRepository.get(STORAGE_KEYS.STUDENT_CARD)).not.toBeNull();

        localStorageRepository.remove(STORAGE_KEYS.STUDENT_CARD);
        emitCardStorage();

        expect(localStorageRepository.get(STORAGE_KEYS.STUDENT_CARD)).toBeNull();
        view.unmount();
    });

    test('impede que uma aba desatualizada restaure o QR após resposta de vencimento do SIGAA, preservando a cópia em falha de rede', async () => {
        const registration = '202644444';
        const options = credentialsQueryOptions(registration);
        const validCard = { token: 'qr-antigo-valido', valid_until: '2027-03-01' };
        const expiredCard = { token: 'qr-vencido', valid_until: '2026-03-01' };
        const renewedCard = { token: 'qr-novo-valido', valid_until: '2028-03-01' };
        let mode: 'offline' | 'expired' = 'offline';
        const middleware: Middleware = {
            onRequest: ({ request }) => {
                if (new URL(request.url).pathname === '/api/me/ru-token') {
                    if (mode === 'offline') throw new TypeError('Sem conexão');
                    return Response.json(expiredCard);
                }
                return Response.json(null);
            }
        };
        apiClient.use(middleware);

        const tab1Client = disabledClient();
        tab1Client.setQueryData(options.queryKey, validCard, {
            updatedAt: Date.now() - 10 * 86400000
        });
        mountCard(registration, tab1Client).unmount();

        const offlineClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        try {
            const offlineView = mountCard(registration, offlineClient);
            await refreshQuery(offlineClient, options, { retry: false }).catch(() => null);
            await dom.testing.waitFor(() =>
                expect(offlineClient.getQueryState(options.queryKey)?.status).toBe('error')
            );
            offlineView.unmount();

            const afterOffline = disabledClient();
            mountCard(registration, afterOffline).unmount();
            expect(afterOffline.getQueryData(options.queryKey)).toEqual(validCard);

            mode = 'expired';
            const tab2Client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
            const tab2View = mountCard(registration, tab2Client);
            await refreshQuery(tab2Client, options, { retry: false });
            await dom.testing.waitFor(() =>
                expect(tab2Client.getQueryData(options.queryKey)).toEqual(expiredCard)
            );
            tab2View.unmount();
            expect(
                localStorageRepository.get<Record<string, unknown>>(STORAGE_KEYS.STUDENT_CARD)
                    ?.credentials
            ).toBeUndefined();

            const reopenedTab1 = mountCard(registration, tab1Client);
            await dom.testing.waitFor(() =>
                expect(reopenedTab1.result.current.data).toBeUndefined()
            );
            reopenedTab1.unmount();

            const tab3Client = disabledClient();
            mountCard(registration, tab3Client).unmount();
            expect(tab3Client.getQueryData(options.queryKey)).toBeUndefined();

            setSystemTime(new Date(NOW.getTime() + 60_000));
            const renewedClient = disabledClient();
            renewedClient.setQueryData(options.queryKey, renewedCard);
            mountCard(registration, renewedClient).unmount();

            const afterRenew = disabledClient();
            mountCard(registration, afterRenew).unmount();
            expect(afterRenew.getQueryData(options.queryKey)).toEqual(renewedCard);
        } finally {
            await clearSession(offlineClient);
            apiClient.eject(middleware);
        }
    });
});
