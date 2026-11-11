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
    const rootRoute = createRootRoute({
        component: () => (
            <PublicInfoSection
                date="2026-10-05"
                now={{ date: '2026-10-05', weekday: 1, time: '08:00' }}
                {...props}
            />
        )
    });
    const routeTree = rootRoute.addChildren([
        createRoute({ getParentRoute: () => rootRoute, path: '/ru' })
    ]);
    const router = createRouter({ routeTree, history: createMemoryHistory() });
    await router.load();

    return renderToStaticMarkup(<RouterProvider router={router} />);
}

const menu: DailyMenu = {
    date: '2026-10-05',
    breakfast: [{ key: 'complement', name: 'Complemento', items: ['Pão com ovos'] }],
    lunch: [
        { key: 'salad_1', name: 'Salada', items: ['Alface'] },
        { key: 'main_dish', name: 'Prato principal', items: ['Frango assado'] }
    ],
    dinner: [{ key: 'main_dish', name: 'Prato principal', items: ['Lagarto ao molho'] }]
};

describe('PublicInfoSection', () => {
    test('mostra o prato principal de cada refeição, incluindo o café e o campus', async () => {
        const markup = await renderSection({ campus: 'Gama', menus: [menu], day: 'Hoje' });

        expect(markup).toContain('Campus Gama');
        expect(markup).toContain('Pão com ovos');
        expect(markup).toContain('Frango assado');
        expect(markup).toContain('Lagarto ao molho');
        expect(markup).not.toContain('Alface');
        expect(markup).toContain('aria-label="Ver cardápio de café da manhã"');
    });

    test.each([
        [true, 'Carregando cardápio...'],
        [false, 'Cardápio das próximas refeições não publicado.']
    ])('sem cardápio, carregando=%p exibe "%s"', async (isLoading, message) => {
        const markup = await renderSection({ campus: 'Darcy', isLoading, day: 'Hoje' });

        expect(markup).toContain(message);
    });

    test('exibe o dia selecionado', async () => {
        const markup = await renderSection({
            campus: 'Darcy',
            day: 'Quarta-feira',
            date: '2026-10-07'
        });

        expect(markup).toContain('Próximas refeições');
        expect(markup).toContain('Cardápio de quarta-feira não publicado.');
    });
});
