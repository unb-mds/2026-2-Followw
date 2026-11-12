import type { Middleware } from 'openapi-fetch';

import { afterAll, afterEach, beforeAll, expect, mock, test } from 'bun:test';
import { useLayoutEffect } from 'react';

import { allClassroomsQueryOptions, type Classroom } from '#/queries/classrooms';
import { apiClient } from '#/queries/client';
import { ApiError } from '#/queries/errors';
import { recommendationsQueryOptions } from '#/queries/recommendations';

import { desktopBrowser } from '../../helpers/desktop';
let desktopPage: typeof import('../../helpers/desktop-page').desktopPage;
let desktopUser: typeof import('../../helpers/desktop-page').desktopUser;
import { useDom } from '../../helpers/dom';
import { runLoader } from '../../helpers/route';

const dom = useDom();
let restoreLayoutEffect: () => Promise<void>;
beforeAll(async () => {
    const { useIsoLayoutEffect } = await import('@base-ui/utils/useIsoLayoutEffect');
    await mock.module('@base-ui/utils/useIsoLayoutEffect', () => ({
        useIsoLayoutEffect: useLayoutEffect
    }));
    restoreLayoutEffect = async () => {
        await mock.module('@base-ui/utils/useIsoLayoutEffect', () => ({ useIsoLayoutEffect }));
    };
    ({ desktopPage, desktopUser } = await import('../../helpers/desktop-page'));
});
afterAll(() => restoreLayoutEffect());
let device: ReturnType<typeof desktopBrowser>;
let page: ReturnType<typeof desktopPage>;
let width = 1440;
afterEach(() => {
    dom.testing.cleanup();
    device?.restore();
    page?.client.clear();
});

async function render(url: string, visitor = false) {
    width = 1440;
    device = desktopBrowser(() => width);
    page = visitor ? desktopPage(url, null) : desktopPage(url);
    await page.router.load();
    return dom.testing.render(page.element);
}

test('visitante acessa o perfil pelo ícone com o rótulo Entrar ao lado', async () => {
    const view = await render('/', true);
    const profile = view.getByRole('link', { name: 'Entrar' });
    expect(profile.textContent).toBe('Entrar');
    expect(profile.getAttribute('href')).toBe('/perfil');
    expect(profile.querySelector('svg')).not.toBeNull();
});

test('navegação do topo mostra o nome de cada rota ao lado do ícone', async () => {
    const view = await render('/', true);
    const nav = view.getByRole('navigation', { name: 'Navegação principal do aplicativo' });
    for (const label of ['Início', 'Turmas', 'RU', 'Buscar']) {
        expect(dom.testing.within(nav).getByRole('link', { name: label }).textContent).toBe(label);
    }
});

test('botão de perfil usa o ícone mesmo quando o discente tem foto', async () => {
    width = 1440;
    device = desktopBrowser(() => width);
    page = desktopPage('/', { ...desktopUser, photo: 'https://exemplo.test/foto.jpg' });
    await page.router.load();
    const view = dom.testing.render(page.element);
    const profile = view.getByRole('link', { name: 'Perfil' });
    expect(profile.querySelector('img')).toBeNull();
    expect(profile.querySelector('svg')).not.toBeNull();
    expect(profile.textContent).toBe('Perfil');
});

test('busca com barra final mantém um único campo e recolhe o atalho da navegação', async () => {
    const view = await render('/buscar/', true);
    expect(view.getAllByRole('searchbox')).toHaveLength(1);
    expect(view.queryByRole('link', { name: 'Buscar' })).toBeNull();
});

test('perfil com barra final mantém a indicação de página atual e o seletor de tema', async () => {
    const view = await render('/perfil/');
    expect(view.getByRole('link', { name: 'Perfil' }).getAttribute('aria-current')).toBe('page');
    expect(view.getAllByRole('button', { name: /Alternar tema/ })).toHaveLength(1);
});

test.each([1440, 390])(
    'perfil em %s px mantém documentos, índices atuais, previsão das turmas, fluxo e confirmação de saída',
    async (viewportWidth) => {
        const view = await render('/perfil');
        await dom.testing.act(async () => {
            width = viewportWidth;
            device.resize();
        });
        expect(view.queryByRole('link', { name: 'Followw, início' }) !== null).toBe(
            viewportWidth >= 1024
        );
        expect(view.getAllByRole('button', { name: /Alternar tema/ })).toHaveLength(1);
        expect(view.queryByRole('link', { name: 'Entrar' })).toBeNull();
        expect(view.getByText('3,72')).toBeDefined();
        expect(view.getByText('3,55')).toBeDefined();
        const progress = view.getByRole('region', { name: 'Progresso do curso' });
        expect(dom.testing.within(progress).getByText('Complementares')).toBeDefined();
        expect(dom.testing.within(progress).getByText('1.140h')).toBeDefined();
        const documents = view.getByRole('region', { name: 'Documentos' });
        expect(dom.testing.within(documents).getAllByRole('button')).toHaveLength(2);
        const account = view.getByRole('region', { name: 'Conta' });
        expect(dom.testing.within(account).queryByRole('button', { name: /Baixar/ })).toBeNull();
        expect(view.queryByText('Não exigidas')).toBeNull();
        expect(dom.testing.within(progress).getByText('Previsto', { exact: true })).toBeDefined();
        expect(progress.textContent).not.toContain('42%');
        expect(progress.textContent).not.toContain('120h');
        expect(view.getByRole('button', { name: 'Baixar histórico acadêmico' })).toBeDefined();
        expect(
            view.getByRole('link', { name: 'Visualizar fluxo acadêmico' }).getAttribute('href')
        ).toBe('/cursos/42');
        dom.testing.fireEvent.click(view.getByRole('button', { name: 'Editar perfil' }));
        expect(await view.findByRole('dialog', { name: 'Editar perfil' })).toBeDefined();
        dom.testing.fireEvent.click(view.getByRole('button', { name: 'Cancelar' }));
        dom.testing.fireEvent.click(view.getByRole('button', { name: 'Desconectar' }));
        expect(await view.findByRole('alertdialog', { name: 'Desconectar?' })).toBeDefined();
    }
);

test('download pendente e erro do documento persistem ao alternar entre desktop e mobile', async () => {
    const view = await render('/perfil');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });
    let requests = 0;
    const middleware: Middleware = {
        onRequest: async () => {
            requests++;
            await gate;
            throw new ApiError(422, 'Documento indisponível para este teste.');
        }
    };
    apiClient.use(middleware);
    try {
        dom.testing.fireEvent.click(
            view.getByRole('button', { name: 'Baixar carteirinha estudantil' })
        );
        await dom.testing.waitFor(() => expect(requests).toBe(1));
        await dom.testing.act(async () => {
            width = 900;
            device.resize();
        });
        expect(
            view
                .getByRole('button', { name: 'Baixar carteirinha estudantil' })
                .getAttribute('aria-busy')
        ).toBe('true');
        expect(
            view
                .getByRole('button', { name: 'Baixar histórico acadêmico' })
                .hasAttribute('disabled')
        ).toBe(true);
        release();
        expect(await view.findByText('Documento indisponível para este teste.')).toBeDefined();
        await dom.testing.act(async () => {
            width = 1440;
            device.resize();
        });
        expect(view.getByRole('alert').textContent).toBe('Documento indisponível para este teste.');
        expect(requests).toBe(1);
    } finally {
        release();
        apiClient.eject(middleware);
    }
});

test('turmas desktop mostra grade matriculada com noite e sábado além dos cartões', async () => {
    const view = await render('/turmas');
    const grid = view.getByRole('region', { name: 'Grade das turmas de 2026.2' });
    expect(grid.textContent).toContain('23:00');
    expect(grid.textContent).toContain('Sáb');
    expect(grid.textContent).not.toContain('Intervalo omitido');
    expect(view.getByRole('button', { name: 'Disciplina de noite' })).toBeDefined();
    expect(
        dom.testing.within(grid).getByRole('button', { name: /Sáb, 21:40–22:30/ })
    ).toBeDefined();
});

test('busca direta mantém um campo e um painel, consulta e filtro ao voltar e avançar', async () => {
    const view = await render('/buscar?q=MAT1000&category=classrooms', true);
    expect(view.getAllByRole('searchbox')).toHaveLength(1);
    expect(view.getAllByRole('complementary', { name: 'Minha grade' })).toHaveLength(1);
    expect(view.getByRole('heading', { name: 'Monte sua grade' })).toBeDefined();
    expect(
        view.getByText('Abra uma matéria e use o botão + para adicionar uma turma.')
    ).toBeDefined();
    expect(view.queryByRole('button', { name: 'Baixar imagem' })).toBeNull();
    const input = view.getByRole('searchbox');
    expect(input instanceof HTMLInputElement && input.value).toBe('MAT1000');
    expect(view.queryByRole('link', { name: 'Buscar' })).toBeNull();
    await dom.testing.act(async () => {
        await page.router.navigate({ to: '/turmas' });
    });
    expect(view.getByRole('link', { name: 'Buscar' })).toBeDefined();
    await dom.testing.act(async () => page.router.history.back());
    await dom.testing.waitFor(() => expect(view.getByRole('searchbox')).toBeDefined());
    const restored = view.getByRole('searchbox');
    expect(restored instanceof HTMLInputElement && restored.value).toBe('MAT1000');
    expect(page.router.state.location.search).toMatchObject({
        q: 'MAT1000',
        category: 'classrooms'
    });
    await dom.testing.act(async () => page.router.history.forward());
    await dom.testing.waitFor(() => expect(page.router.state.location.pathname).toBe('/turmas'));
    expect(view.getByRole('link', { name: 'Entrar com SIGAA' })).toBeDefined();
});

test('clique na busca exibe o campo antes das turmas e mantém o mesmo campo após carregar', async () => {
    const { Route: SearchRoute } = await import('#/routes/_app/buscar');
    const view = await render('/');
    page.client.removeQueries({ queryKey: allClassroomsQueryOptions.queryKey });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });
    const history = page.client.query({
        ...allClassroomsQueryOptions,
        queryFn: async (): Promise<Classroom[]> => {
            await gate;
            return [];
        }
    });
    const recommendations = page.client.query({
        ...recommendationsQueryOptions,
        queryFn: async () => {
            await gate;
            return [];
        }
    });
    const target = Object.values(page.router.routesById).find(
        (route) => route.fullPath === '/buscar'
    );
    if (!target) throw new Error('Rota de busca ausente');
    target.options.loader = ({ location }) =>
        runLoader(SearchRoute, {
            location,
            context: { queryClient: page.client }
        });
    try {
        dom.testing.fireEvent.click(view.getByRole('link', { name: 'Buscar' }));
        const input = await view.findByRole('searchbox');
        expect(view.getAllByRole('searchbox')).toHaveLength(1);
        expect(view.getByText('Buscando recomendações...')).toBeDefined();
        expect(page.client.getQueryState(allClassroomsQueryOptions.queryKey)?.status).toBe(
            'pending'
        );
        expect(view.queryByRole('link', { name: 'Buscar' })).toBeNull();
        await dom.testing.act(async () => {
            release();
            await Promise.all([history, recommendations]);
        });
        expect(view.getByRole('searchbox')).toBe(input);
    } finally {
        release();
        await Promise.all([history, recommendations]);
    }
});

test('redimensionar a busca preserva o campo e a URL e troca uma única navegação', async () => {
    const view = await render('/buscar?q=MAT1000&category=classrooms', true);
    const input = view.getByRole('searchbox');
    await dom.testing.act(async () => {
        width = 900;
        device.resize();
    });
    expect(view.getByRole('searchbox')).toBe(input);
    expect(input instanceof HTMLInputElement && input.value).toBe('MAT1000');
    expect(page.router.state.location.search).toMatchObject({
        q: 'MAT1000',
        category: 'classrooms'
    });
    expect(view.getAllByRole('navigation')).toHaveLength(1);
    expect(view.queryByRole('complementary', { name: 'Minha grade' })).toBeNull();
    expect(view.getByRole('link', { name: 'Buscar' })).toBeDefined();
    await dom.testing.act(async () => {
        width = 1440;
        device.resize();
    });
    expect(view.getByRole('searchbox')).toBe(input);
    expect(view.getAllByRole('navigation')).toHaveLength(1);
    expect(view.getAllByRole('complementary', { name: 'Minha grade' })).toHaveLength(1);
});

test('navegação pendente mantém um único controle de busca durante a transformação', async () => {
    const view = await render('/buscar?q=MAT1000&category=classrooms', true);
    let release: () => void;
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });
    const target = Object.values(page.router.routesById).find(
        (route) => route.fullPath === '/turmas'
    );
    if (!target) throw new Error('Rota de turmas ausente');
    target.options.loader = () => gate;
    let navigation: Promise<void>;
    const sharedIcons = () => view.container.querySelectorAll('[data-desktop-search]');
    expect(sharedIcons()).toHaveLength(1);
    await dom.testing.act(async () => {
        navigation = page.router.navigate({ to: '/turmas' });
    });
    expect(view.getByRole('searchbox')).toBeDefined();
    expect(sharedIcons()).toHaveLength(1);
    await dom.testing.act(async () => {
        release();
        await navigation;
    });
    expect(view.queryByRole('searchbox')).toBeNull();
    expect(sharedIcons()).toHaveLength(1);
});
