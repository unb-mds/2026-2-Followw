import {
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
    RouterProvider
} from '@tanstack/react-router';
import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { CookiesBlockedPage } from '#/components/CookiesBlockedPage';

async function renderPage() {
    const rootRoute = createRootRoute({ component: CookiesBlockedPage });
    const routeTree = rootRoute.addChildren([
        createRoute({ getParentRoute: () => rootRoute, path: '/' })
    ]);
    const router = createRouter({
        routeTree,
        history: createMemoryHistory({ initialEntries: ['/'] })
    });
    await router.load();

    return renderToStaticMarkup(<RouterProvider router={router} />);
}

describe('CookiesBlockedPage', () => {
    test('explica o bloqueio de cookies e oferece recarregar ou seguir sem entrar', async () => {
        const markup = await renderPage();

        expect(markup).toContain('Cookies bloqueados');
        expect(markup).toContain('Permita cookies para este site');
        expect(markup).toContain('Recarregar página');
        expect(markup).toMatch(/<a[^>]*href="\/"[^>]*>Continuar sem entrar<\/a>/);
    });
});
