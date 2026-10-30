import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    RouterContextProvider,
    createMemoryHistory,
    createRootRoute,
    createRouter
} from '@tanstack/react-router';
import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { createLoader, createSerializer } from 'nuqs/server';

import type { Classroom, ClassroomPost } from '#/queries/classrooms';

import { LatestNewsSection } from '#/components/home/LatestNewsSection';
import { classroomSearchParsers, validateClassroomSearch } from '#/lib/classroom-search';
import { parseRouterSearch, stringifyRouterSearch } from '#/lib/search-params';
import { latestNewsQueryOptions } from '#/queries/posts';
import { Route as ClassroomRoute } from '#/routes/_app/turmas_.$id';

import { useDom } from '../../helpers/dom';
import { renderWithRouter } from '../../helpers/router';

const classroom: Classroom = {
    id: 'AAA',
    number: '01',
    semester: '2026.2',
    current: true,
    professors: [],
    subject: { code: 'FGA0001', name: 'Cálculo' }
};

function news(id: number, date?: string): ClassroomPost {
    return {
        id: `news:${id}`,
        type: 'news',
        title: `Notícia ${id}`,
        published_on: date,
        attachments: []
    };
}

function renderSection(client: QueryClient) {
    const markup = renderWithRouter(
        <QueryClientProvider client={client}>
            <LatestNewsSection />
        </QueryClientProvider>
    );
    client.clear();
    return markup;
}

function clientWith(posts: ClassroomPost[]) {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false, retryOnMount: false, staleTime: Infinity } }
    });
    client.setQueryData(latestNewsQueryOptions.queryKey, {
        items: posts.map((post) => ({ classroom, post })),
        updating: false
    });
    return client;
}

describe('últimas notícias da home', () => {
    test('mostra título, turma, data, prévia e link para Postagens', () => {
        const post = news(1, '2026-10-29');
        const client = clientWith([post]);
        client.setQueryData(latestNewsQueryOptions.queryKey, {
            items: [
                {
                    classroom,
                    post: {
                        ...post,
                        content: 'Leia **o capítulo 1** e [o aviso](https://unb.br).'
                    }
                }
            ],
            updating: false
        });
        const markup = renderSection(client);
        expect(markup).toContain('Últimas notícias');
        expect(markup).toContain('Notícia 1');
        expect(markup).toContain('Cálculo');
        expect(markup).toContain('Turma 01');
        expect(markup).toContain('29/10/2026');
        expect(markup).toContain('o capítulo 1');
        expect(markup).not.toContain('**');
        expect(markup).not.toContain('href="https://unb.br"');
        expect(markup).toContain('href="/turmas/AAA?tab=posts"');
    });

    test('informa que não há notícias mesmo sem turmas atuais', () => {
        expect(renderSection(clientWith([]))).toContain('Nenhuma notícia por enquanto.');
        const client = clientWith([]);
        client.setQueryData(latestNewsQueryOptions.queryKey, { items: [], updating: false });
        expect(renderSection(client)).toContain('Nenhuma notícia por enquanto.');
    });

    test('carregamento não é confundido com ausência de notícias', () => {
        const client = new QueryClient();

        const markup = renderSection(client);
        expect(markup).toContain('Carregando notícias');
        expect(markup).not.toContain('Nenhuma notícia por enquanto.');
    });

    test('mostra notícias disponíveis enquanto outras turmas são sincronizadas', () => {
        const client = clientWith([]);
        client.setQueryData(latestNewsQueryOptions.queryKey, {
            items: [{ classroom, post: news(1) }],
            updating: true
        });
        const markup = renderSection(client);
        expect(markup).toContain('Notícia 1');
        expect(markup).not.toContain('Carregando notícias');
        expect(markup).not.toContain('Nenhuma notícia por enquanto.');
    });

    test('revalidação com falha preserva notícias salvas', () => {
        const client = clientWith([news(1)]);
        client
            .getQueryCache()
            .find({ queryKey: latestNewsQueryOptions.queryKey })
            ?.setState({
                status: 'error',
                error: new Error('SIGAA indisponível'),
                fetchStatus: 'idle'
            });
        const markup = renderSection(client);
        expect(markup).toContain('Notícia 1');
        expect(markup).toContain('Exibindo os dados salvos');
    });

    test('consulta agregada não abre consultas adicionais por turma ou prévia', () => {
        const client = clientWith([news(1)]);
        renderWithRouter(
            <QueryClientProvider client={client}>
                <LatestNewsSection />
            </QueryClientProvider>
        );
        expect(
            client
                .getQueryCache()
                .getAll()
                .map((query) => query.queryKey[1])
        ).toEqual(['/posts/news']);
        client.clear();
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
});

describe('card rotativo de notícias', () => {
    const dom = useDom();
    let client: QueryClient;

    afterEach(() => {
        dom.testing.cleanup();
        client?.clear();
    });

    function mount(count: number) {
        const posts = Array.from({ length: count }, (_, index) => news(index + 1));
        client = clientWith(posts);
        const router = createRouter({
            routeTree: createRootRoute(),
            history: createMemoryHistory(),
            parseSearch: parseRouterSearch,
            stringifySearch: stringifyRouterSearch
        });
        return dom.testing.render(
            <RouterContextProvider router={router}>
                <QueryClientProvider client={client}>
                    <LatestNewsSection />
                </QueryClientProvider>
            </RouterContextProvider>
        );
    }

    test('mostra uma notícia por vez e navega pelas cinco em ciclo', () => {
        const view = mount(5);
        expect(view.getAllByRole('heading', { level: 3 })).toHaveLength(1);
        expect(view.getByRole('heading', { name: 'Notícia 1' })).toBeTruthy();
        expect(view.getByText('1 / 5')).toBeTruthy();
        dom.testing.fireEvent.click(view.getByRole('button', { name: 'Notícia anterior' }));
        expect(view.getByRole('heading', { name: 'Notícia 5' })).toBeTruthy();
        dom.testing.fireEvent.click(view.getByRole('button', { name: 'Próxima notícia' }));
        expect(view.getByRole('heading', { name: 'Notícia 1' })).toBeTruthy();
        expect(view.container.querySelectorAll('[data-slot="card"]')).toHaveLength(1);
        expect(view.getByRole('link').getAttribute('href')).toBe('/turmas/AAA?tab=posts');
    });

    test('alterna a cada cinco segundos e permite parar e continuar', () => {
        const intervals = spyOn(globalThis, 'setInterval');
        const clears = spyOn(globalThis, 'clearInterval');
        try {
            const view = mount(2);
            const tick = intervals.mock.calls.find((call) => call[1] === 5000)?.[0];
            if (typeof tick !== 'function') throw new Error('Rotação automática não iniciou');
            dom.testing.act(() => tick());
            expect(view.getByRole('heading', { name: 'Notícia 2' })).toBeTruthy();
            dom.testing.fireEvent.click(view.getByRole('button', { name: 'Parar' }));
            expect(clears).toHaveBeenCalled();
            expect(
                view.getByRole('button', { name: 'Continuar' }).getAttribute('aria-pressed')
            ).toBe('true');
            const started = intervals.mock.calls.filter((call) => call[1] === 5000).length;
            dom.testing.fireEvent.click(view.getByRole('button', { name: 'Continuar' }));
            expect(intervals.mock.calls.filter((call) => call[1] === 5000)).toHaveLength(
                started + 1
            );
        } finally {
            intervals.mockRestore();
            clears.mockRestore();
        }
    });

    test('pausa a rotação durante leitura com mouse ou teclado', () => {
        const intervals = spyOn(globalThis, 'setInterval');
        const clears = spyOn(globalThis, 'clearInterval');
        try {
            const view = mount(2);
            const card = view.getByRole('region', { name: 'Notícias recentes das turmas' });
            dom.testing.fireEvent.mouseEnter(card);
            expect(clears).toHaveBeenCalledTimes(1);
            dom.testing.fireEvent.mouseLeave(card);
            expect(intervals.mock.calls.filter((call) => call[1] === 5000)).toHaveLength(2);
            dom.testing.fireEvent.focus(view.getByRole('link'));
            expect(clears).toHaveBeenCalledTimes(2);
        } finally {
            intervals.mockRestore();
            clears.mockRestore();
        }
    });

    test('notícia única não mostra controles nem inicia rotação', () => {
        const intervals = spyOn(globalThis, 'setInterval');
        try {
            const view = mount(1);
            expect(view.queryByRole('button', { name: 'Parar' })).toBeNull();
            expect(intervals.mock.calls.some((call) => call[1] === 5000)).toBe(false);
        } finally {
            intervals.mockRestore();
        }
    });
});
