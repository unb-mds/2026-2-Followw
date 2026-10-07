import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { pagesCacheName } from '#/integrations/offline/pages-cache';
import { clearOfflineData, warmPages } from '#/integrations/offline/storage';

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

describe('cache de páginas offline', () => {
    let stores: Map<string, FakeCache>;
    let pages: Record<string, Response | undefined>;
    const cached = () => [...(stores.get(current)?.entries.keys() ?? [])].toSorted();

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

    test('guarda as páginas principais conforme o login', async () => {
        for (const url of ['/', '/ru', '/turmas', '/perfil', '/login'])
            pages[url] = new Response(url);

        await warmPages(true);
        expect(cached()).toEqual(['/', '/perfil', '/ru', '/turmas']);

        stores.clear();
        await warmPages(false);
        expect(cached()).toEqual(['/', '/login', '/ru', '/turmas']);
    });

    test('baixa só as páginas que faltam e apaga caches de builds antigos', async () => {
        const home = new Response('home');
        stores.set('followw-pages-antigo', new FakeCache());
        stores.set('outro-cache', new FakeCache());
        stores.set(current, new FakeCache());
        stores.get(current)?.entries.set('/', home);
        pages['/'] = new Response('nova home');
        pages['/ru'] = new Response('ru');

        await warmPages(true);

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

        await warmPages(true);

        expect(cached()).toEqual(['/turmas']);
    });

    test('clearOfflineData apaga todas as páginas guardadas', async () => {
        stores.set(current, new FakeCache());
        stores.set('outro-cache', new FakeCache());
        await clearOfflineData();
        expect([...stores.keys()]).toEqual(['outro-cache']);
    });

    test('clearOfflineData não quebra sem Cache Storage (SSR)', async () => {
        Reflect.deleteProperty(globalThis, 'caches');
        await clearOfflineData();
    });
});
