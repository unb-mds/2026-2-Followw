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
    test('hoje mostra só a próxima refeição, com o prato principal e o campus', async () => {
        const markup = await renderSection({ campus: 'Gama', menus: [menu], day: 'Hoje' });

        expect(markup).toContain('Campus Gama');
        expect(markup).toContain('Próxima refeição');
        expect(markup).toContain('Café da manhã');
        expect(markup).toContain('Pão com ovos');
        expect(markup).not.toContain('Frango assado');
        expect(markup).not.toContain('Lagarto ao molho');
        expect(markup).not.toContain('aria-roledescription');
        expect(markup).toContain('aria-label="Ver cardápio do RU"');
    });

    test('próxima refeição sem cardápio exibe aviso dela, sem pular para outra', async () => {
        const markup = await renderSection({
            campus: 'Darcy',
            menus: [{ ...menu, breakfast: null }],
            day: 'Hoje'
        });

        expect(markup).toContain('Cardápio do café da manhã não publicado.');
        expect(markup).not.toContain('Frango assado');
    });

    test('carregando exibe o aviso de carregamento', async () => {
        const markup = await renderSection({ campus: 'Darcy', isLoading: true, day: 'Hoje' });

        expect(markup).toContain('Carregando cardápio...');
    });

    test('outro dia lista o prato principal de todas as refeições', async () => {
        const markup = await renderSection({
            campus: 'Darcy',
            menus: [{ ...menu, date: '2026-10-07' }],
            day: 'Quarta-feira',
            date: '2026-10-07'
        });

        expect(markup).toContain('Pratos principais · Quarta-feira');
        expect(markup).toContain('Pão com ovos');
        expect(markup).toContain('Frango assado');
        expect(markup).toContain('Lagarto ao molho');
        expect(markup).not.toContain('Alface');
    });

    test('outro dia sem cardápio exibe o dia selecionado', async () => {
        const markup = await renderSection({
            campus: 'Darcy',
            day: 'Quarta-feira',
            date: '2026-10-07'
        });

        expect(markup).toContain('Cardápio de quarta-feira não publicado.');
    });
});
