import {
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
    RouterProvider
} from '@tanstack/react-router';
import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { BottomNavigation } from '#/components/BottomNavigation';

async function renderNavigation(pathname: string) {
    const rootRoute = createRootRoute({ component: BottomNavigation });
    const routeTree = rootRoute.addChildren(
        ['/', '/turmas', '/turmas/$id', '/ru', '/perfil'].map((path) =>
            createRoute({ getParentRoute: () => rootRoute, path })
        )
    );
    const router = createRouter({
        routeTree,
        history: createMemoryHistory({ initialEntries: [pathname] }),
        trailingSlash: 'preserve'
    });
    await router.load();

    return renderToStaticMarkup(<RouterProvider router={router} />);
}

describe('BottomNavigation', () => {
    test('oferece apenas ícones com destinos e nomes acessíveis', async () => {
        const markup = await renderNavigation('/');
        const links = [...markup.matchAll(/<a\b([^>]*)>([^]*?)<\/a>/g)].map(
            ([, attributes, content]) => ({
                href: attributes.match(/href="([^"]*)"/)?.[1],
                label: attributes.match(/aria-label="([^"]*)"/)?.[1],
                role: attributes.match(/role="([^"]*)"/)?.[1],
                text: content.replace(/<[^>]*>/g, '').trim()
            })
        );

        expect(links).toEqual([
            { href: '/', label: 'Início', role: undefined, text: '' },
            { href: '/turmas', label: 'Turmas', role: undefined, text: '' },
            { href: '/ru', label: 'RU', role: undefined, text: '' },
            { href: '/perfil', label: 'Perfil', role: undefined, text: '' }
        ]);
    });

    test.each([
        ['/', 'Início'],
        ['/turmas', 'Turmas'],
        ['/turmas/', 'Turmas'],
        ['/turmas/123', 'Turmas'],
        ['/turmas/123/', 'Turmas']
    ])('indica apenas a página atual em %s', async (pathname, label) => {
        const markup = await renderNavigation(pathname);
        const activeLabels = [...markup.matchAll(/<a\b([^>]*)>/g)]
            .filter(([, attributes]) => attributes.includes('aria-current="page"'))
            .map(([, attributes]) => attributes.match(/aria-label="([^"]*)"/)?.[1]);

        expect(activeLabels).toEqual([label]);
    });
});
