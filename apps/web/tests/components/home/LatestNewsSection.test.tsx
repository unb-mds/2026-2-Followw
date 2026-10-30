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
import { latestNews } from '#/lib/latest-news';
import { parseRouterSearch, stringifyRouterSearch } from '#/lib/search-params';
import {
    classroomPostDetailQueryOptions,
    classroomPostsQueryOptions,
    classroomsQueryOptions
} from '#/queries/classrooms';
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
    client.setQueryData(classroomsQueryOptions.queryKey, [classroom]);
    client.setQueryData(classroomPostsQueryOptions(classroom.id, 'news').queryKey, posts);
    return client;
}

describe('últimas notícias da home', () => {
    test('seleciona cinco notícias mais recentes entre turmas atuais e ignora avaliações', () => {
        const posts = [
            news(1, '2026-10-01'),
            news(2, '2026-10-20'),
            news(3, '2026-10-12'),
            news(4, '2026-10-15'),
            news(5, '2026-10-29'),
            news(6, '2026-10-25'),
            { ...news(8, '2026-10-30'), type: 'assessment' as const }
        ];
        const selected = latestNews([
            { classroom, posts },
            { classroom: { ...classroom, id: 'BBB' }, posts: [news(7, '2026-10-28')] },
            { classroom: { ...classroom, current: false }, posts: [news(9, '2026-10-30')] }
        ]);
        expect(selected.map(({ post }) => post.id)).toEqual([
            'news:5',
            'news:7',
            'news:6',
            'news:2',
            'news:4'
        ]);
        expect(posts[0].id).toBe('news:1');
    });

    test('datas ausentes ficam ao fim e empates têm ordem estável', () => {
        const posts = [news(3), news(2, '2026-10-15'), news(1, '2026-10-15')];
        expect(latestNews([{ classroom, posts }]).map(({ post }) => post.id)).toEqual([
            'news:1',
            'news:2',
            'news:3'
        ]);
    });

    test('remove notícias com mesmo ID ou título e dia entre turmas antes do limite', () => {
        const repeated = { ...news(1, '2026-10-30'), title: 'Aviso importante' };
        const selected = latestNews([
            {
                classroom,
                posts: [
                    repeated,
                    { ...repeated },
                    news(2, '2026-10-29'),
                    news(3, '2026-10-28'),
                    news(4, '2026-10-27'),
                    news(5, '2026-10-26')
                ]
            },
            {
                classroom: { ...classroom, id: 'BBB' },
                posts: [
                    {
                        ...repeated,
                        id: 'news:99',
                        title: '  AVISO   IMPORTANTE  ',
                        published_on: undefined,
                        published_at: '2026-10-30T10:00:00'
                    }
                ]
            }
        ]);
        expect(selected.map(({ post }) => post.id)).toEqual([
            'news:99',
            'news:2',
            'news:3',
            'news:4',
            'news:5'
        ]);
    });

    test('retorna menos de cinco quando só há duas notícias distintas', () => {
        const first = news(1, '2026-10-30');
        const second = news(2, '2026-10-29');
        const selected = latestNews([{ classroom, posts: [first, first, second, second, first] }]);
        expect(selected.map(({ post }) => post.id)).toEqual(['news:1', 'news:2']);
    });

    test('preserva títulos iguais publicados em dias diferentes e não deduz duplicatas sem data', () => {
        const first = news(1, '2026-10-30');
        const selected = latestNews([
            {
                classroom,
                posts: [
                    first,
                    { ...first, id: 'news:2', published_on: '2026-10-29' },
                    { ...first, id: 'news:3', published_on: null },
                    { ...first, id: 'news:4', published_on: null }
                ]
            }
        ]);
        expect(selected).toHaveLength(4);
    });

    test('mostra título, turma, data, prévia e link para Postagens', () => {
        const post = news(1, '2026-10-29');
        const client = clientWith([post]);
        client.setQueryData(classroomPostDetailQueryOptions(classroom.id, post.id).queryKey, {
            ...post,
            content: 'Leia **o capítulo 1** e [o aviso](https://unb.br).'
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
        client.setQueryData(classroomsQueryOptions.queryKey, []);
        expect(renderSection(client)).toContain('Nenhuma notícia por enquanto.');
    });

    test('notícias repetidas não criam controles para preencher cinco posições', () => {
        const post = news(1, '2026-10-30');
        const markup = renderSection(clientWith([post, post, post, post, post]));
        expect(markup).toContain('Notícia 1');
        expect(markup).not.toContain('Próxima notícia');
        expect(markup).not.toContain('Parar');
    });

    test('carregamento não é confundido com ausência de notícias', () => {
        const client = new QueryClient();
        client.setQueryData(classroomsQueryOptions.queryKey, [classroom]);
        const markup = renderSection(client);
        expect(markup).toContain('Carregando notícias');
        expect(markup).not.toContain('Nenhuma notícia por enquanto.');
    });

    test('falha na listagem mantém notícias de outras turmas e permite tentar novamente', () => {
        const post = news(1, '2026-10-29');
        const client = clientWith([post]);
        client.setQueryData(classroomsQueryOptions.queryKey, [
            classroom,
            { ...classroom, id: 'BBB' }
        ]);
        client
            .getQueryCache()
            .build(client, classroomPostsQueryOptions('BBB', 'news'))
            .setState({
                status: 'error',
                fetchStatus: 'idle',
                error: { detail: [] }
            });
        const markup = renderSection(client);
        expect(markup).toContain('Notícia 1');
        expect(markup).toContain('Tentar novamente');
        expect(markup).not.toContain('Nenhuma notícia por enquanto.');
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
        for (const post of posts) {
            client.setQueryData(classroomPostDetailQueryOptions(classroom.id, post.id).queryKey, {
                ...post,
                content: `Prévia de ${post.title}`
            });
        }
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
