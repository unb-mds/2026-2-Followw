import {
    RouterProvider,
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter
} from '@tanstack/react-router';
import { afterEach, describe, expect, test } from 'bun:test';

import { BottomNavigation } from '#/components/BottomNavigation';

import { useDom } from '../helpers/dom';

describe('atalho da carteirinha do RU', () => {
    const dom = useDom();
    afterEach(() => dom.testing.cleanup());

    async function renderAt(pathname: string) {
        const rootRoute = createRootRoute({ component: BottomNavigation });
        const router = createRouter({
            routeTree: rootRoute.addChildren(
                ['/', '/turmas', '/ru', '/buscar', '/perfil'].map((path) =>
                    createRoute({ getParentRoute: () => rootRoute, path })
                )
            ),
            history: createMemoryHistory({ initialEntries: [pathname] })
        });
        await router.load();
        const page = dom.testing.render(<RouterProvider router={router} />);
        return { router, ru: page.getByRole('link', { name: /RU/ }) };
    }

    test('com outra aba ativa, o clique apenas abre o RU', async () => {
        const { router, ru } = await renderAt('/');
        dom.testing.fireEvent.click(ru);

        await dom.testing.waitFor(() => expect(router.state.location.pathname).toBe('/ru'));
        expect(router.state.location.state.studentCard).toBeUndefined();
    });

    test('com a aba do RU ativa, um novo clique pede a carteirinha', async () => {
        const { router, ru } = await renderAt('/ru');
        dom.testing.fireEvent.click(ru);

        await dom.testing.waitFor(() => expect(router.state.location.state.studentCard).toBe(true));
        expect(router.state.location.pathname).toBe('/ru');
    });
});
