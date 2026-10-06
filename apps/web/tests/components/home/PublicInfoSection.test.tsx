import {
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
    RouterProvider
} from '@tanstack/react-router';
import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { DailyMenu } from '#/queries/restaurant';

import { PublicInfoSection } from '#/components/home/PublicInfoSection';

async function renderSection(props: React.ComponentProps<typeof PublicInfoSection>) {
    const rootRoute = createRootRoute({ component: () => <PublicInfoSection {...props} /> });
    const routeTree = rootRoute.addChildren([
        createRoute({ getParentRoute: () => rootRoute, path: '/ru' })
    ]);
    const router = createRouter({ routeTree, history: createMemoryHistory() });
    await router.load();

    return renderToStaticMarkup(<RouterProvider router={router} />);
}

const menu: DailyMenu = {
    date: '2026-10-05',
    lunch: [
        { key: 'salad_1', name: 'Salada', items: ['Alface'] },
        { key: 'main_dish', name: 'Prato principal', items: ['Frango assado'] }
    ],
    dinner: [{ key: 'main_dish', name: 'Prato principal', items: ['Lagarto ao molho'] }]
};

describe('PublicInfoSection', () => {
    test('mostra o prato principal de cada refeição e o campus', async () => {
        const markup = await renderSection({ campus: 'Gama', menu });

        expect(markup).toContain('Campus Gama');
        expect(markup).toContain('Frango assado');
        expect(markup).toContain('Lagarto ao molho');
        expect(markup).not.toContain('Alface');
        expect(markup).toContain('aria-label="Ver cardápio do RU"');
    });

    test.each([
        [true, 'Carregando cardápio...'],
        [false, 'Cardápio de hoje não publicado.']
    ])('sem cardápio, carregando=%p exibe "%s"', async (isLoading, message) => {
        const markup = await renderSection({ campus: 'Darcy', isLoading });

        expect(markup).toContain(message);
    });

    test('exibe o dia selecionado quando não é hoje', async () => {
        const markup = await renderSection({ campus: 'Darcy', day: 'Quarta-feira' });

        expect(markup).toContain('Prato principal · Quarta-feira');
        expect(markup).toContain('Cardápio de quarta-feira não publicado.');
    });
});
