import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { pagesCacheName } from '#/lib/pages-cache';
import {
    clearCachedPages,
    currentPagesCacheName,
    offlinePages,
    warmPages
} from '#/lib/service-worker';

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

describe('cache de páginas offline', () => {
    let stores: Map<string, FakeCache>;
    let pages: Record<string, Response | undefined>;

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

    test('guarda as páginas principais conforme o login', () => {
        expect(offlinePages(true)).toEqual(['/', '/ru', '/turmas', '/perfil']);
        expect(offlinePages(false)).toEqual(['/', '/ru', '/turmas', '/login']);
    });

    test('baixa só as páginas que faltam e apaga caches de builds antigos', async () => {
        const current = currentPagesCacheName();
        const home = new Response('home');
        stores.set('followw-pages-antigo', new FakeCache());
        stores.set('outro-cache', new FakeCache());
        stores.set(current, new FakeCache());
        stores.get(current)?.entries.set('/', home);
        pages['/'] = new Response('nova home');
        pages['/ru'] = new Response('ru');

        await warmPages(['/', '/ru', '/turmas']);

        expect([...stores.keys()].toSorted()).toEqual([current, 'outro-cache'].toSorted());
        const entries = stores.get(current)?.entries;
        expect(entries?.get('/')).toBe(home);
        expect(entries?.has('/ru')).toBe(true);
        // falha de rede numa página não impede as outras
        expect(entries?.has('/turmas')).toBe(false);
    });

    test('o cache de páginas é versionado por build', () => {
        expect(pagesCacheName('abc')).toBe('followw-pages-abc');
    });

    test('descarta respostas redirecionadas e com erro', async () => {
        pages['/perfil'] = redirected();
        await warmPages(['/perfil']);
        expect(stores.get(currentPagesCacheName())?.entries.has('/perfil')).toBe(false);

        pages['/ru'] = new Response('erro', { status: 500 });
        await warmPages(['/ru']);
        expect(stores.get(currentPagesCacheName())?.entries.has('/ru')).toBe(false);
    });

    test('limpa todas as páginas guardadas', async () => {
        stores.set(currentPagesCacheName(), new FakeCache());
        stores.set('outro-cache', new FakeCache());
        await clearCachedPages();
        expect([...stores.keys()]).toEqual(['outro-cache']);
    });

    test('não quebra sem Cache Storage (SSR)', async () => {
        Reflect.deleteProperty(globalThis, 'caches');
        await warmPages(['/']);
        await clearCachedPages();
    });
});
