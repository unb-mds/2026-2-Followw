import {
    RouterProvider,
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
    isNotFound
} from '@tanstack/react-router';
import { createRequestHandler, renderSsrHtmlResponse } from '@tanstack/react-router/ssr/server';
import { describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { renderToStaticMarkup } from 'react-dom/server';

import { NotFoundPage } from '#/components/NotFoundPage';
import { addDays, nowInBrasilia } from '#/lib/schedule';
import { meQueryOptions } from '#/queries/me';
import { menuQueryOptions } from '#/queries/restaurant';
import { getRouter } from '#/router';
import { Route as FallbackRoute } from '#/routes/$';
import { Route as RootRoute } from '#/routes/__root';

import { callRoute } from '../helpers/route';

async function renderMissingPage(path: string) {
    const root = createRootRoute({ notFoundComponent: RootRoute.options.notFoundComponent });
    const fallback = createRoute({
        getParentRoute: () => root,
        path: '$',
        beforeLoad: () => callRoute(FallbackRoute.options.beforeLoad)
    });
    const router = createRouter({
        routeTree: root.addChildren([fallback]),
        history: createMemoryHistory({ initialEntries: [path] })
    });
    await router.load();
    return { router, markup: renderToStaticMarkup(<RouterProvider router={router} />) };
}

async function requestPage(path: string) {
    const request = new Request(`http://localhost${path}`);
    const handler = createRequestHandler({
        request,
        createRouter: () => {
            const router = getRouter();
            const { queryClient } = router.options.context;
            const now = nowInBrasilia();
            queryClient.setQueryData(meQueryOptions.queryKey, null);
            for (const date of [now.date, addDays(now.date, 1)]) {
                queryClient.setQueryData(menuQueryOptions({ date, user: null }).queryKey, []);
            }
            return router;
        }
    });
    return handler(({ router, responseHeaders }) =>
        renderSsrHtmlResponse({ router, responseHeaders, render: () => '<!doctype html>' })
    );
}

describe('página não encontrada', () => {
    test.each(['/pagina-inexistente', '/nada/aqui?origem=teste', '/assets/arquivo-antigo.js'])(
        '%s retorna HTTP 404 sem redirecionar',
        async (path) => {
            const response = await requestPage(path);
            expect(response.status).toBe(404);
            expect(response.headers.get('location')).toBeNull();
        }
    );

    test.each(['/', '/ru'])('%s continua retornando HTTP 200', async (path) => {
        const response = await requestPage(path);
        expect(response.status).toBe(200);
    });

    test.each(['/pagina-inexistente', '/nada/aqui?origem=teste', '/assets/arquivo-antigo.js'])(
        '%s aciona a página 404 e preserva o endereço solicitado',
        async (path) => {
            const { router, markup } = await renderMissingPage(path);
            expect(router.state.matches.some((match) => isNotFound(match.error))).toBe(true);
            expect(router.state.location.href).toBe(path);
            expect(markup).toContain('Essa página se perdeu.');
            expect(RootRoute.options.notFoundComponent).toBe(NotFoundPage);
        }
    );

    test('define o título da página 404 no head da rota raiz', async () => {
        const head = await callRoute(RootRoute.options.head, {
            match: { error: { isNotFound: true, routeId: '__root__' } }
        });
        expect(head?.meta).toContainEqual({ title: 'Página não encontrada | Followw' });
    });

    test('oferece retorno ao início e o símbolo do Followw sem abas de navegação', async () => {
        const { markup } = await renderMissingPage('/perdido');
        const browser = new Window();
        try {
            browser.document.body.innerHTML = markup;
            const document = browser.document;
            expect(document.querySelector('h1')?.textContent).toContain('404');
            expect(document.querySelector('nav')).toBeNull();
            const logo = document.querySelector('header a');
            expect(logo?.getAttribute('href')).toBe('/');
            expect(logo?.querySelector('img')?.getAttribute('src')).toBe('/favicon.svg');
            const returnLink = Array.from(document.querySelectorAll('a')).find((link) =>
                link.textContent.includes('Voltar ao início')
            );
            expect(returnLink?.getAttribute('href')).toBe('/');
        } finally {
            await browser.happyDOM.close();
        }
    });

    test('mantém a arte decorativa com arquivos locais e sem créditos na página', async () => {
        const { markup } = await renderMissingPage('/fora-do-mapa');
        const browser = new Window();
        try {
            browser.document.body.innerHTML = markup;
            const document = browser.document;
            const images = document.querySelectorAll('[aria-hidden="true"] img');
            expect(images.length).toBe(3);
            for (const image of images) {
                expect(image.getAttribute('alt')).toBe('');
                expect(image.getAttribute('width')).toBeTruthy();
                expect(image.getAttribute('height')).toBeTruthy();
            }
            const filesExist = await Promise.all(
                Array.from(images, (image) =>
                    Bun.file(`public${image.getAttribute('src')}`).exists()
                )
            );
            expect(filesExist).toEqual([true, true, true]);
            expect(document.querySelector('footer')).toBeNull();
            expect(document.querySelector('a[href^="https://commons.wikimedia.org/"]')).toBeNull();
            expect(document.body.textContent).not.toContain('Fotos do ICC');
        } finally {
            await browser.happyDOM.close();
        }
    });
});
