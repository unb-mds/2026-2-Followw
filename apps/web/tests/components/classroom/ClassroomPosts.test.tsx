import type { ClassroomPost } from '@followw/core/queries/classrooms.ts';
import type { Middleware } from 'openapi-fetch';

import { classroomPostsQueryOptions } from '@followw/core/queries/classrooms.ts';
import { apiClient } from '@followw/core/queries/client.ts';
import { ApiError } from '@followw/core/queries/errors.ts';
import { QueryClient, QueryClientProvider, environmentManager } from '@tanstack/react-query';
import {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    test,
    spyOn
} from 'bun:test';
import { Window } from 'happy-dom';

import { ClassroomPosts } from '#/components/classroom/ClassroomPosts';
import { SIGAA_DOWN_MESSAGE } from '#/components/ErrorState';
import * as downloads from '#/lib/download';

const topic: ClassroomPost = {
    id: 'topic:' + 'a'.repeat(64),
    type: 'topic',
    title: 'Sistemas de numeração',
    starts_on: '2026-10-15',
    ends_on: '2026-10-20',
    content: 'Leia o **capítulo 1**.',
    attachments: [],
    is_read: false
};
const posts: ClassroomPost[] = [
    {
        id: 'news:1',
        type: 'news',
        title: 'Bem-vindos à turma',
        published_on: '2026-10-15',
        attachments: [],
        is_read: false
    },
    topic,
    {
        id: 'material:' + 'b'.repeat(64),
        type: 'material',
        title: 'Slides.pdf',
        topic_id: topic.id,
        attachments: [],
        is_read: false
    },
    {
        id: 'material:' + 'c'.repeat(64),
        type: 'material',
        title: 'Leitura online',
        topic_id: topic.id,
        url: 'https://example.org/aula',
        attachments: [],
        is_read: false
    },
    {
        id: 'assessment:1',
        type: 'assessment',
        title: 'Prova 1',
        starts_on: '2026-10-29',
        time_label: 'Hora da aula',
        attachments: [],
        is_read: false
    }
];

let testing: typeof import('@testing-library/react/pure');
let browser: Window;
const wasServer = environmentManager.isServer();
const globals = new Map<string, PropertyDescriptor | undefined>();

beforeAll(async () => {
    environmentManager.setIsServer(() => false);
    browser = new Window({ url: 'http://localhost/turmas/AAA' });
    const values = {
        window: browser,
        document: browser.document,
        navigator: browser.navigator,
        HTMLElement: browser.HTMLElement,
        Element: browser.Element,
        Node: browser.Node,
        DocumentFragment: browser.DocumentFragment,
        MutationObserver: browser.MutationObserver,
        ResizeObserver: browser.ResizeObserver,
        getComputedStyle: browser.getComputedStyle.bind(browser),
        requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
        cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
        IS_REACT_ACT_ENVIRONMENT: true
    };
    for (const [key, value] of Object.entries(values)) {
        globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
        Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    }
    testing = await import('@testing-library/react/pure');
});

afterAll(async () => {
    environmentManager.setIsServer(() => wasServer);
    await browser.happyDOM.abort();
    for (const [key, descriptor] of globals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});

describe('postagens da turma com a API', () => {
    let client: QueryClient;
    let middleware: Middleware;
    let requests: Request[];
    let list: ClassroomPost[];
    let failList: boolean;
    let failDetail: boolean;
    let downloadErrorStatus: number | null;
    let releaseDownload: (() => void) | undefined;
    let save: ReturnType<typeof spyOn<typeof downloads, 'saveFile'>>;

    beforeEach(() => {
        requests = [];
        list = posts;
        failList = false;
        failDetail = false;
        downloadErrorStatus = null;
        releaseDownload = undefined;
        save = spyOn(downloads, 'saveFile').mockImplementation(() => {});
        client = new QueryClient({
            defaultOptions: { queries: { retry: false, staleTime: Infinity } }
        });
        middleware = {
            onRequest: async ({ request }) => {
                requests.push(request);
                const path = decodeURIComponent(new URL(request.url).pathname);
                if (path.endsWith('/download')) {
                    if (downloadErrorStatus)
                        throw new ApiError(downloadErrorStatus, 'Indisponível');
                    await new Promise<void>((resolve) => {
                        releaseDownload = resolve;
                    });
                    const second = path.includes('d'.repeat(64));
                    return new Response(second ? 'segundo arquivo' : 'primeiro arquivo', {
                        headers: {
                            'content-type': 'application/pdf',
                            'content-disposition': "attachment; filename*=UTF-8''Notas.pdf"
                        }
                    });
                }
                if (path.endsWith('/posts/news:1')) {
                    return failDetail
                        ? Response.json({ detail: 'Indisponível' }, { status: 502 })
                        : Response.json({
                              ...posts[0],
                              content: 'Confira o **plano de ensino**.',
                              published_at: '2026-10-15T10:30:00',
                              attachments: [
                                  { name: 'Plano.pdf', url: 'https://example.org/plano.pdf' }
                              ]
                          });
                }
                if (path.endsWith('/posts'))
                    return failList
                        ? Response.json({ detail: 'Indisponível' }, { status: 502 })
                        : Response.json(list);
                return Response.json({ detail: 'Rota inesperada' }, { status: 404 });
            }
        };
        apiClient.use(middleware);
    });

    afterEach(() => {
        testing.cleanup();
        client.clear();
        apiClient.eject(middleware);
        save.mockRestore();
    });

    const renderPosts = () =>
        testing.render(
            <QueryClientProvider client={client}>
                <ClassroomPosts id="AAA" />
            </QueryClientProvider>
        );

    test('lista os quatro tipos e busca notícia somente ao abrir com ID opaco', async () => {
        const page = renderPosts();
        const news = await page.findByRole('button', { name: /Bem-vindos à turma/ });
        expect(page.getByText('Tópico de aula')).toBeDefined();
        expect(page.getByText('Avaliação')).toBeDefined();
        expect(page.getAllByText('Material')).toHaveLength(2);
        expect(requests).toHaveLength(1);
        testing.fireEvent.click(news);
        expect(await page.findByText('plano de ensino')).toBeDefined();
        const attachment = page.getByRole('link', { name: 'Plano.pdf' });
        expect(attachment.getAttribute('href')).toBe('https://example.org/plano.pdf');
        expect(attachment.getAttribute('rel')).toContain('noopener');
        expect(page.getByText('Publicada em 15/10/2026 10:30')).toBeDefined();
        expect(
            requests.map((request) => decodeURIComponent(new URL(request.url).pathname))
        ).toEqual(['/api/classrooms/AAA/posts', '/api/classrooms/AAA/posts/news:1']);
    });

    test('filtra materiais sem perder o vínculo com o tópico ou fazer novas consultas', async () => {
        const page = renderPosts();
        await page.findByRole('button', { name: /Slides.pdf/ });
        testing.fireEvent.click(page.getByRole('button', { name: 'Materiais' }));
        expect(page.queryByRole('button', { name: /Bem-vindos à turma/ })).toBeNull();
        expect(page.getAllByText('Tópico: Sistemas de numeração')).toHaveLength(2);
        testing.fireEvent.click(page.getByRole('button', { name: /Slides.pdf/ }));
        expect(await page.findByRole('button', { name: 'Baixar' })).toBeDefined();
        expect(page.queryByRole('link', { name: 'Acessar material' })).toBeNull();
        expect(page.queryByRole('link', { name: 'Abrir SIGAA' })).toBeNull();
        testing.fireEvent.click(page.getByRole('button', { name: /Leitura online/ }));
        const link = await page.findByRole('link', { name: 'Acessar material' });
        expect(link.getAttribute('href')).toBe('https://example.org/aula');
        expect(requests).toHaveLength(1);
    });

    test('cada postagem homônima baixa seu próprio arquivo e mostra progresso', async () => {
        list = [
            { ...posts[2], title: 'Notas.pdf' },
            { ...posts[2], id: 'material:' + 'd'.repeat(64), title: 'Notas.pdf' }
        ];
        const page = renderPosts();
        const items = await page.findAllByRole('button', { name: /Notas.pdf/ });
        const baixar = async (index: number) => {
            releaseDownload = undefined;
            testing.fireEvent.click(items[index]);
            testing.fireEvent.click(await page.findByRole('button', { name: 'Baixar' }));
            const pending = await page.findByRole('button', { name: 'Baixando...' });
            expect(pending.hasAttribute('disabled')).toBe(true);
            await testing.waitFor(() => expect(releaseDownload).toBeDefined());
            await testing.act(async () => {
                releaseDownload?.();
            });
            await testing.waitFor(() => expect(save).toHaveBeenCalledTimes(index + 1));
        };
        await baixar(0);
        await baixar(1);
        const [first, second] = save.mock.calls;
        expect(await first[0].text()).toBe('primeiro arquivo');
        expect(await second[0].text()).toBe('segundo arquivo');
        expect(first[0].type).toBe('application/pdf');
        expect(first[1]).toBe('Notas.pdf');
        expect(second[1]).toBe('Notas.pdf');
        expect(requests.filter((request) => request.method === 'POST')).toHaveLength(2);
    });

    test('baixa anexos e abre referências do próprio tópico no filtro de tópicos', async () => {
        list = [
            ...posts,
            {
                ...posts[2],
                id: 'material:' + 'e'.repeat(64),
                topic_id: 'topic:outro',
                title: 'Outro.pdf'
            }
        ];
        const page = renderPosts();
        testing.fireEvent.click(await page.findByRole('button', { name: 'Tópicos de aula' }));
        testing.fireEvent.click(await page.findByRole('button', { name: /Sistemas de numeração/ }));
        const materials = testing.within(
            await page.findByRole('list', { name: 'Materiais do tópico' })
        );
        expect(materials.getByText('Slides.pdf')).toBeDefined();
        expect(materials.queryByText('Outro.pdf')).toBeNull();
        expect(materials.getByRole('link', { name: 'Acessar material' }).getAttribute('href')).toBe(
            'https://example.org/aula'
        );
        testing.fireEvent.click(materials.getByRole('button', { name: 'Baixar' }));
        await testing.waitFor(() => expect(releaseDownload).toBeDefined());
        await testing.act(async () => {
            releaseDownload?.();
        });
        await testing.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
        const paths = requests
            .filter((request) => request.method === 'POST')
            .map((request) => decodeURIComponent(new URL(request.url).pathname));
        expect(paths).toEqual([`/api/classrooms/AAA/posts/${posts[2].id}/download`]);
    });

    test('orienta a atualizar as postagens quando o anexo não é mais encontrado', async () => {
        downloadErrorStatus = 404;
        const page = renderPosts();
        testing.fireEvent.click(await page.findByRole('button', { name: /Slides.pdf/ }));
        testing.fireEvent.click(await page.findByRole('button', { name: 'Baixar' }));
        expect((await page.findByRole('alert')).textContent).toContain('Atualize as postagens');
        expect(page.getByRole('button', { name: 'Atualizar' })).toBeDefined();
        expect(save).not.toHaveBeenCalled();
    });

    test('erro de download aparece no item e permite tentar novamente', async () => {
        downloadErrorStatus = 502;
        const page = renderPosts();
        testing.fireEvent.click(await page.findByRole('button', { name: /Slides.pdf/ }));
        testing.fireEvent.click(await page.findByRole('button', { name: 'Baixar' }));
        expect((await page.findByRole('alert')).textContent).toContain('Não foi possível baixar');
        expect(page.getByRole('button', { name: 'Baixar' }).hasAttribute('disabled')).toBe(false);
        expect(save).not.toHaveBeenCalled();
        downloadErrorStatus = null;
        testing.fireEvent.click(page.getByRole('button', { name: 'Baixar' }));
        await testing.waitFor(() => expect(releaseDownload).toBeDefined());
        await testing.act(async () => {
            releaseDownload?.();
        });
        await testing.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
        expect(page.queryByRole('alert')).toBeNull();
    });

    test('abre texto do tópico e agenda de avaliação sem inventar horários ou buscar detalhes', async () => {
        const page = renderPosts();
        await page.findByRole('button', { name: /Prova 1/ });
        testing.fireEvent.click(page.getByRole('button', { name: /^Tópico de aula/ }));
        expect(await page.findByText('capítulo 1')).toBeDefined();
        testing.fireEvent.click(page.getByRole('button', { name: /Prova 1/ }));
        expect(await page.findByText('Agendada para 29/10/2026 · Hora da aula.')).toBeDefined();
        expect(requests).toHaveLength(1);
    });

    test('distingue lista vazia de filtro sem resultados', async () => {
        list = [posts[0]];
        const page = renderPosts();
        await page.findByRole('button', { name: /Bem-vindos à turma/ });
        testing.fireEvent.click(page.getByRole('button', { name: 'Materiais' }));
        expect(page.getByText('Nenhuma postagem deste tipo.')).toBeDefined();
        list = [];
        testing.fireEvent.click(page.getByRole('button', { name: 'Atualizar' }));
        expect(await page.findByText('Nenhuma postagem publicada.')).toBeDefined();
    });

    test('falha inicial permite tentar novamente sem perder a turma', async () => {
        failList = true;
        const page = renderPosts();
        expect(await page.findByText(SIGAA_DOWN_MESSAGE)).toBeDefined();
        failList = false;
        testing.fireEvent.click(page.getByRole('button', { name: /tentar novamente/i }));
        expect(await page.findByRole('button', { name: /Bem-vindos à turma/ })).toBeDefined();
    });

    test('mantém postagens salvas quando a atualização falha e pede revalidação à API', async () => {
        client.setQueryData(classroomPostsQueryOptions('AAA').queryKey, posts);
        const page = renderPosts();
        failList = true;
        testing.fireEvent.click(page.getByRole('button', { name: 'Atualizar' }));
        expect(
            await page.findByText(
                'Não foi possível atualizar as postagens. Exibindo os dados salvos.'
            )
        ).toBeDefined();
        expect(page.getByRole('button', { name: /Bem-vindos à turma/ })).toBeDefined();
        expect(
            requests[0].headers.get('Cache-Control') === 'no-cache' ||
                requests[0].cache === 'reload'
        ).toBe(true);
    });

    test('erro de conteúdo aparece no item e mantém as outras postagens acessíveis', async () => {
        failDetail = true;
        const page = renderPosts();
        testing.fireEvent.click(await page.findByRole('button', { name: /Bem-vindos à turma/ }));
        expect(await page.findByText(SIGAA_DOWN_MESSAGE)).toBeDefined();
        expect(page.getByRole('button', { name: /Prova 1/ })).toBeDefined();
    });

    test('atualizar postagens também revalida o conteúdo da notícia aberta', async () => {
        const page = renderPosts();
        testing.fireEvent.click(await page.findByRole('button', { name: /Bem-vindos à turma/ }));
        await page.findByRole('link', { name: 'Plano.pdf' });
        testing.fireEvent.click(page.getByRole('button', { name: 'Atualizar' }));
        await testing.waitFor(() => expect(requests).toHaveLength(4));
        const refreshed = requests.slice(2);
        expect(
            refreshed.every(
                (request) =>
                    request.headers.get('Cache-Control') === 'no-cache' ||
                    request.cache === 'reload'
            )
        ).toBe(true);
        expect(
            refreshed.some((request) =>
                decodeURIComponent(new URL(request.url).pathname).endsWith('/posts/news:1')
            )
        ).toBe(true);
    });
});
