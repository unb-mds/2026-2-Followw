import { QueryClient } from '@tanstack/react-query';
import {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    spyOn,
    test
} from 'bun:test';
import { IDBFactory } from 'fake-indexeddb';
import { clear, get, set } from 'idb-keyval';

import { PAGES_SESSION_MARKER, pagesCacheName } from '#/integrations/offline/pages-cache';
import { clearOfflineData, persistQueryCache, warmPages } from '#/integrations/offline/storage';

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
    let stores: Map<string, FakeCache>;
    let pages: Record<string, Response | undefined>;
    const cached = () =>
        [...(stores.get(current)?.entries.keys() ?? [])]
            .filter((key) => key !== PAGES_SESSION_MARKER)
            .toSorted();

    beforeEach(() => {
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

        await warmPages();
        expect(cached()).toEqual(['/', '/perfil', '/ru', '/turmas']);
    });

    test('baixa só as páginas que faltam e apaga caches de builds antigos', async () => {
        const home = new Response('home');
        stores.set('followw-pages-antigo', new FakeCache());
        stores.set('outro-cache', new FakeCache());
        stores.set(current, new FakeCache());
        stores.get(current)?.entries.set('/', home);
        pages['/'] = new Response('nova home');
        pages['/ru'] = new Response('ru');

        await warmPages();

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

        await warmPages();

        expect(cached()).toEqual(['/turmas']);
    });

    test('logout impede que uma pré-carga em andamento recrie o cache', async () => {
        const { promise, resolve } = Promise.withResolvers<string[]>();
        const keys = spyOn(caches, 'keys').mockReturnValueOnce(promise);
        pages['/'] = new Response('home');
        try {
            const pending = warmPages();
            await clearOfflineData();
            resolve([]);
            await pending;
            expect(stores.size).toBe(0);
        } finally {
            keys.mockRestore();
        }
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

describe('restauração do cache', () => {
    test('avisa quando termina de restaurar', () => {
        let restored = 0;
        persistQueryCache(new QueryClient(), () => restored++);
        expect(restored).toBe(1);
    });
});

// espera o throttle de 200 ms do persister
const throttle = () => Bun.sleep(300);

describe('cache de dados no IndexedDB', () => {
    const key = 'followw-query-cache';
    const saved = () => get<string>(key);

    beforeAll(() => {
        Object.defineProperty(globalThis, 'indexedDB', {
            configurable: true,
            value: new IDBFactory()
        });
    });

    afterEach(() => clear());

    afterAll(() => {
        Reflect.deleteProperty(globalThis, 'indexedDB');
    });

    test('salva as queries da sessão', async () => {
        const client = new QueryClient();
        const { promise, resolve } = Promise.withResolvers<void>();
        const stop = persistQueryCache(client, resolve);
        await promise;

        client.setQueryData(['dado'], 1);
        await throttle();

        expect(await saved()).toContain('"dado"');
        stop();
    });

    test('clearOfflineData apaga o cache de dados salvo', async () => {
        await set(key, 'snapshot da conta');

        await clearOfflineData();

        expect(await saved()).toBeUndefined();
    });

    test('limpa a invalidação ao persistir erro só na carteirinha, preservando outras consultas', async () => {
        const client = new QueryClient();
        const { promise, resolve } = Promise.withResolvers<void>();
        const stop = persistQueryCache(client, resolve);
        await promise;

        const cardKey = ['get', '/me/ru-token', undefined, '251000000'];
        const card = { token: 'qr-local', valid_until: '2027-03-01' };
        const frequencyKey = [
            'get',
            '/classrooms/{classroom_id}/frequency',
            { params: { path: { classroom_id: '1' } } }
        ];
        client.setQueryData(cardKey, card);
        client.setQueryData(frequencyKey, { lessons: [] });
        await Promise.all([
            client
                .query({
                    queryKey: cardKey,
                    queryFn: () => Promise.reject(new TypeError('Sem conexão')),
                    retry: false
                })
                .catch(() => null),
            client
                .query({
                    queryKey: frequencyKey,
                    queryFn: () => Promise.reject(new TypeError('Sem conexão')),
                    retry: false
                })
                .catch(() => null)
        ]);
        await throttle();
        stop();

        const restored = new QueryClient();
        const done = Promise.withResolvers<void>();
        const stopRestored = persistQueryCache(restored, done.resolve);
        await done.promise;
        stopRestored();

        const cardState = restored.getQueryState(cardKey);
        expect(cardState?.data).toEqual(card);
        expect(cardState?.status).toBe('success');
        expect(cardState?.isInvalidated).toBe(false);

        const frequencyState = restored.getQueryState(frequencyKey);
        expect(frequencyState?.data).toEqual({ lessons: [] });
        expect(frequencyState?.status).toBe('success');
        expect(frequencyState?.isInvalidated).toBe(true);
    });

    test('depois do logout nenhuma mudança volta a ser salva', async () => {
        const client = new QueryClient();
        const { promise, resolve } = Promise.withResolvers<void>();
        persistQueryCache(client, resolve);
        await promise;
        client.setQueryData(['dado'], 1);
        await throttle();

        // a mudança logo antes do logout ainda estava no throttle
        client.setQueryData(['dado'], 2);
        await clearOfflineData();
        client.setQueryData(['dado'], 3);
        await throttle();

        expect(await saved()).toBeUndefined();
    });
});
