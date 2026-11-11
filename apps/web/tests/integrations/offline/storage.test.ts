import { dehydrate, hydrate, QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';

import type { OfflineSession } from '#/integrations/offline/session';

import { PAGES_SESSION_MARKER, pagesCacheName } from '#/integrations/offline/pages-cache';
import { changeOfflineSession } from '#/integrations/offline/session';
import {
    clearOfflineData,
    mergeOfflineSnapshots,
    persistQueryCache,
    PERSIST_MAX_AGE,
    shouldPersistQuery,
    warmPages
} from '#/integrations/offline/storage';
import { credentialsQueryOptions } from '#/queries/restaurant-account';

import { useDom } from '../../helpers/dom';

// sem o define do vite, o build é 'dev'
const current = pagesCacheName('dev');

// Cache Storage mínimo
class FakeCache {
    entries = new Map<string, Response>();
    match = async (url: string) => this.entries.get(url);
    delete = async (url: string) => this.entries.delete(url);
    put = async (url: string, response: Response) => {
        this.entries.set(url, response);
    };
}

function redirected() {
    const response = new Response('login');
    Object.defineProperty(response, 'redirected', { value: true });
    return response;
}

const realFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
const realNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

describe('cache de páginas offline', () => {
    useDom();
    let session: OfflineSession;
    let stores: Map<string, FakeCache>;
    let pages: Record<string, Response | undefined>;
    const cached = () =>
        [...(stores.get(current)?.entries.keys() ?? [])]
            .filter((key) => key !== PAGES_SESSION_MARKER)
            .toSorted();

    beforeEach(() => {
        session = changeOfflineSession('251000000');
        stores = new Map();
        pages = {};
        // `pages` define a resposta de cada URL; sem entrada, a rede falha
        Object.defineProperty(globalThis, 'fetch', {
            configurable: true,
            writable: true,
            value: async (url: string) => {
                const response = pages[url];
                if (!response) throw new TypeError('offline');
                return response;
            }
        });
        Object.defineProperty(globalThis, 'caches', {
            configurable: true,
            value: {
                keys: async () => [...stores.keys()],
                delete: async (name: string) => stores.delete(name),
                open: async (name: string) => {
                    if (!stores.has(name)) stores.set(name, new FakeCache());
                    return stores.get(name);
                }
            }
        });
    });

    afterEach(() => {
        if (realFetch) Object.defineProperty(globalThis, 'fetch', realFetch);
        Reflect.deleteProperty(globalThis, 'caches');
    });

    test('guarda as páginas principais da sessão', async () => {
        for (const url of ['/', '/ru', '/turmas', '/perfil', '/login'])
            pages[url] = new Response(url);

        await warmPages(session);
        expect(cached()).toEqual(['/', '/perfil', '/ru', '/turmas']);
        expect(await stores.get(current)?.entries.get(PAGES_SESSION_MARKER)?.text()).toBe(
            session.id
        );
    });

    test('baixa só as páginas que faltam e apaga caches de builds antigos', async () => {
        const home = new Response('home');
        stores.set('followw-pages-antigo', new FakeCache());
        stores.set('outro-cache', new FakeCache());
        stores.set(current, new FakeCache());
        stores.get(current)?.entries.set('/', home);
        pages['/'] = new Response('nova home');
        pages['/ru'] = new Response('ru');

        await warmPages(session);

        expect([...stores.keys()].toSorted()).toEqual([current, 'outro-cache'].toSorted());
        expect(stores.get(current)?.entries.get('/')).toBe(home);
        // falha de rede numa página não impede as outras
        expect(cached()).toEqual(['/', '/ru']);
    });

    test('o cache de páginas é versionado por build', () => {
        expect(pagesCacheName('abc')).toBe('followw-pages-abc');
    });

    test('descarta respostas redirecionadas e com erro', async () => {
        pages['/perfil'] = redirected();
        pages['/ru'] = new Response('erro', { status: 500 });
        pages['/turmas'] = new Response('turmas');

        await warmPages(session);

        expect(cached()).toEqual(['/turmas']);
    });

    test('logout impede que uma pré-carga em andamento recrie o cache', async () => {
        const { promise, resolve } = Promise.withResolvers<string[]>();
        const keys = spyOn(caches, 'keys').mockReturnValueOnce(promise);
        pages['/'] = new Response('home');
        try {
            const pending = warmPages(session);
            await clearOfflineData();
            resolve([]);
            await pending;
            expect(stores.size).toBe(0);
        } finally {
            keys.mockRestore();
        }
    });

    test('outra aba revoga a pré-carga anterior antes de gravar a página', async () => {
        const { promise, resolve } = Promise.withResolvers<Response>();
        const started = Promise.withResolvers<void>();
        Object.defineProperty(globalThis, 'fetch', {
            value: () => {
                started.resolve();
                return promise;
            }
        });
        const pending = warmPages(session);
        await started.promise;
        changeOfflineSession(null);
        resolve(new Response('home da conta anterior'));
        await pending;
        expect(cached()).toEqual([]);
    });

    test('clearOfflineData apaga as páginas, mantém os arquivos públicos e remove o service worker', async () => {
        stores.set(current, new FakeCache());
        stores.set('workbox-precache-v2', new FakeCache());
        let unregistered = 0;
        const registration = { unregister: async () => Boolean(++unregistered) };
        Object.defineProperty(globalThis, 'navigator', {
            configurable: true,
            value: { serviceWorker: { getRegistrations: async () => [registration] } }
        });
        try {
            await clearOfflineData();
        } finally {
            if (realNavigator) Object.defineProperty(globalThis, 'navigator', realNavigator);
        }
        expect([...stores.keys()]).toEqual(['workbox-precache-v2']);
        expect(unregistered).toBe(1);
    });

    test('clearOfflineData não quebra sem Cache Storage nem service worker (SSR)', async () => {
        Reflect.deleteProperty(globalThis, 'caches');
        await clearOfflineData();
    });
});

const queryAt = (updatedAt: number) => {
    const client = new QueryClient();
    client.setQueryData(['dado'], 1, { updatedAt });
    return client.getQueryCache().find({ queryKey: ['dado'] })!;
};

describe('shouldPersistQuery', () => {
    const now = Date.parse('2026-10-10T12:00:00Z');

    test('salva a query atualizada dentro da validade', () => {
        expect(shouldPersistQuery(queryAt(now - PERSIST_MAX_AGE + 1), now)).toBe(true);
    });

    test('descarta a query sem atualização há mais que a validade', () => {
        expect(shouldPersistQuery(queryAt(now - PERSIST_MAX_AGE), now)).toBe(false);
    });

    test('não salva query sem dado', () => {
        const client = new QueryClient();
        client.getQueryCache().build(client, { queryKey: ['vazia'] });
        const query = client.getQueryCache().find({ queryKey: ['vazia'] })!;
        expect(shouldPersistQuery(query, now)).toBe(false);
    });

    test('restaura a última carteirinha mesmo depois de uma atualização falhar', async () => {
        const client = new QueryClient();
        const { queryKey } = credentialsQueryOptions('251000000');
        const card = { token: 'qr-local', valid_until: '2099-12-01' };
        client.setQueryData(queryKey, card);
        const error = new TypeError('Sem conexão');
        const failure = await client
            .query({
                queryKey,
                queryFn: () => Promise.reject(error),
                retry: false
            })
            .catch((reason: unknown) => reason);
        expect(failure).toBe(error);
        expect(client.getQueryState(queryKey)?.status).toBe('error');

        const restored = new QueryClient();
        hydrate(restored, dehydrate(client, { shouldDehydrateQuery: shouldPersistQuery }));
        expect(restored.getQueryData(queryKey)).toEqual(card);
    });

    test('mantém os dados da página consultada após uma falha de rede', async () => {
        const client = new QueryClient();
        const queryKey = ['get', '/classrooms'];
        const classrooms = [{ id: 'turma-1' }];
        client.setQueryData(queryKey, classrooms);
        await client
            .query({ queryKey, queryFn: () => Promise.reject(new TypeError()), retry: false })
            .catch(() => null);

        const restored = new QueryClient();
        hydrate(restored, dehydrate(client, { shouldDehydrateQuery: shouldPersistQuery }));
        expect(restored.getQueryData(queryKey)).toEqual(classrooms);
    });
});

describe('restauração do cache', () => {
    test('avisa quando termina de restaurar', () => {
        let restored = 0;
        persistQueryCache(new QueryClient(), '251000000', () => restored++);
        expect(restored).toBe(1);
    });
});

describe('gravações offline de duas abas', () => {
    const now = Date.parse('2026-10-10T12:00:00Z');
    const snapshot = (buster: string, client: QueryClient) => ({
        buster,
        timestamp: now,
        clientState: dehydrate(client)
    });

    test('preserva consultas distintas e o dado mais recente da mesma sessão', () => {
        const saved = new QueryClient();
        saved.setQueryData(['carteirinha'], 'qr', { updatedAt: now - 1 });
        saved.setQueryData(['saldo'], 20, { updatedAt: now - 1 });
        saved.setQueryData(['vencida'], 'antiga', { updatedAt: now - PERSIST_MAX_AGE });
        const incoming = new QueryClient();
        incoming.setQueryData(['turmas'], [], { updatedAt: now });
        incoming.setQueryData(['saldo'], 10, { updatedAt: now - 2 });

        const merged = mergeOfflineSnapshots(
            snapshot('sessão', saved),
            snapshot('sessão', incoming),
            now
        );
        const restored = new QueryClient();
        hydrate(restored, merged.clientState);
        expect(restored.getQueryData(['carteirinha'])).toBe('qr');
        expect(restored.getQueryData(['turmas'])).toEqual([]);
        expect(restored.getQueryData(['saldo'])).toBe(20);
        expect(restored.getQueryData(['vencida'])).toBeUndefined();
    });

    test('não incorpora consultas salvas por uma sessão anterior', () => {
        const saved = new QueryClient();
        saved.setQueryData(['carteirinha'], 'qr anterior', { updatedAt: now });
        const incoming = snapshot('sessão atual', new QueryClient());

        expect(mergeOfflineSnapshots(snapshot('sessão anterior', saved), incoming, now)).toBe(
            incoming
        );
    });
});
