import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    RouterContextProvider,
    createMemoryHistory,
    createRootRoute,
    createRouter
} from '@tanstack/react-router';
import { afterAll, afterEach, beforeAll, describe, expect, mock, test } from 'bun:test';
import { createLoader, createSerializer } from 'nuqs/server';
import { useLayoutEffect } from 'react';

import type { Classroom, ClassroomPost } from '#/queries/classrooms';

import { classroomSearchParsers, validateClassroomSearch } from '#/lib/classroom-search';
import { localStorageRepository, STORAGE_KEYS } from '#/lib/local-storage';
import { parseRouterSearch, stringifyRouterSearch } from '#/lib/search-params';
import { latestNewsQueryOptions } from '#/queries/posts';
import { Route as ClassroomRoute } from '#/routes/_app/turmas_.$id';

import { useDom } from '../../helpers/dom';

const classroom: Classroom = {
    id: 'AAA',
    number: '01',
    semester: '2026.2',
    current: true,
    professors: [],
    subject: { code: 'FGA0001', name: 'Cálculo' }
};

function news(id: number, extra: Partial<ClassroomPost> = {}): ClassroomPost {
    return {
        id: `news:${id}`,
        type: 'news',
        title: `Notícia ${id}`,
        attachments: [],
        is_read: false,
        ...extra
    };
}

function clientWith(posts: ClassroomPost[] | null, updating = false) {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false, retryOnMount: false, staleTime: Infinity } }
    });
    if (posts)
        client.setQueryData(latestNewsQueryOptions.queryKey, {
            items: posts.map((post) => ({ classroom, post })),
            updating
        });
    return client;
}

let NewsNotifications: typeof import('#/components/home/NewsNotifications').NewsNotifications;

describe('popover de notificações', () => {
    const dom = useDom();
    let client: QueryClient;
    let restoreLayoutEffect: () => Promise<void>;

    // o portal do base-ui só monta com o layout effect real no happy-dom
    beforeAll(async () => {
        const { useIsoLayoutEffect } = await import('@base-ui/utils/useIsoLayoutEffect');
        await mock.module('@base-ui/utils/useIsoLayoutEffect', () => ({
            useIsoLayoutEffect: useLayoutEffect
        }));
        restoreLayoutEffect = async () => {
            await mock.module('@base-ui/utils/useIsoLayoutEffect', () => ({ useIsoLayoutEffect }));
        };
        ({ NewsNotifications } = await import('#/components/home/NewsNotifications'));
    });
    afterAll(() => restoreLayoutEffect());

    afterEach(() => {
        dom.testing.cleanup();
        client?.clear();
        localStorageRepository.remove(STORAGE_KEYS.SEEN_NEWS);
    });

    function mount(target: QueryClient) {
        client = target;
        const router = createRouter({
            routeTree: createRootRoute(),
            history: createMemoryHistory(),
            parseSearch: parseRouterSearch,
            stringifySearch: stringifyRouterSearch
        });
        return dom.testing.render(
            <RouterContextProvider router={router}>
                <QueryClientProvider client={client}>
                    <NewsNotifications />
                </QueryClientProvider>
            </RouterContextProvider>
        );
    }

    async function open(view: ReturnType<typeof mount>) {
        dom.testing.fireEvent.click(view.getByRole('button', { name: /Notificações/ }));
        return view.findByText('Últimas notícias');
    }

    test('lista as notícias com turma, data, prévia e link para Postagens', async () => {
        const view = mount(
            clientWith([
                news(1, {
                    published_on: '2026-10-29',
                    content: 'Leia **o capítulo 1** e [o aviso](https://unb.br).'
                }),
                news(2)
            ])
        );
        await open(view);
        expect(view.getByText('Notícia 1')).toBeTruthy();
        expect(view.getByText('Notícia 2')).toBeTruthy();
        expect(view.getAllByText('Cálculo')).toHaveLength(2);
        expect(view.getByText('29/10/2026')).toBeTruthy();
        expect(document.body.textContent).toContain('o capítulo 1');
        expect(document.body.textContent).not.toContain('**');
        expect(document.querySelector('a[href="https://unb.br"]')).toBeNull();
        const links = view.getAllByRole('link').map((link) => link.getAttribute('href'));
        expect(links).toEqual(['/turmas/AAA?tab=posts', '/turmas/AAA?tab=posts']);
    });

    test.each([null, undefined, '', '  \n  '])(
        'notícia sem texto mostra convite para leitura: %p',
        async (content) => {
            const view = mount(clientWith([news(1, { content })]));
            await open(view);
            expect(view.getByText('Clique para ler mais.')).toBeTruthy();
        }
    );

    test('mostra o ponto de não lida até abrir o popover', async () => {
        const view = mount(clientWith([news(1)]));
        expect(view.getByTestId('unread-dot')).toBeTruthy();
        await open(view);
        expect(view.queryByTestId('unread-dot')).toBeNull();
        expect(localStorageRepository.get(STORAGE_KEYS.SEEN_NEWS)).toBe('AAA:news:1');
    });

    test('notícia nova volta a mostrar o ponto', () => {
        localStorageRepository.set(STORAGE_KEYS.SEEN_NEWS, 'AAA:news:1');
        expect(mount(clientWith([news(1)])).queryByTestId('unread-dot')).toBeNull();
        dom.testing.cleanup();
        expect(mount(clientWith([news(2), news(1)])).getByTestId('unread-dot')).toBeTruthy();
    });

    test('sem notícias não mostra o ponto e informa a ausência', async () => {
        const view = mount(clientWith([]));
        expect(view.queryByTestId('unread-dot')).toBeNull();
        await open(view);
        expect(view.getByText('Nenhuma notícia por enquanto.')).toBeTruthy();
    });

    test('informa a sincronização quando ainda não há notícias', async () => {
        const view = mount(clientWith([], true));
        await open(view);
        expect(view.getByText('Buscando notícias das turmas...')).toBeTruthy();
    });

    test('revalidação com falha preserva notícias salvas', async () => {
        const target = clientWith([news(1)]);
        target
            .getQueryCache()
            .find({ queryKey: latestNewsQueryOptions.queryKey })
            ?.setState({
                status: 'error',
                error: new Error('SIGAA indisponível'),
                fetchStatus: 'idle'
            });
        const view = mount(target);
        await open(view);
        expect(view.getByText('Notícia 1')).toBeTruthy();
        expect(document.body.textContent).toContain('Exibindo os dados salvos');
    });

    test('consulta agregada não abre consultas adicionais por turma ou prévia', async () => {
        const target = clientWith([news(1)]);
        await open(mount(target));
        expect(
            target
                .getQueryCache()
                .getAll()
                .map((query) => query.queryKey[1])
        ).toEqual(['/posts/news']);
    });
});

test('aba de destino é validada e mantém frequência como padrão', () => {
    const load = createLoader(classroomSearchParsers);
    expect(ClassroomRoute.options.validateSearch).toBe(validateClassroomSearch);
    expect(validateClassroomSearch['~standard'].validate({ tab: 'posts' })).toEqual({
        value: { tab: 'posts' }
    });
    expect(load('?tab=posts')).toEqual({ tab: 'posts' });
    expect(load('?tab=members')).toEqual({ tab: 'members' });
    expect(load('?tab=invalida')).toEqual({ tab: 'frequency' });
    expect(load('')).toEqual({ tab: 'frequency' });
    const serialize = createSerializer(classroomSearchParsers);
    expect(serialize({ tab: 'posts' })).toBe('?tab=posts');
    expect(serialize({ tab: 'frequency' })).toBe('');
});
