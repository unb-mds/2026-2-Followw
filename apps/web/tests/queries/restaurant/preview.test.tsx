import type { Middleware } from 'openapi-fetch';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, test } from 'bun:test';

import { upcomingMenuMeals } from '#/lib/restaurant';
import { apiClient } from '#/queries/client';
import { useMenuPreview, type DailyMenu } from '#/queries/restaurant';

import { useDom } from '../../helpers/dom';

const dom = useDom();
let client: QueryClient;
let middleware: Middleware;
afterEach(() => {
    client?.clear();
    if (middleware) apiClient.eject(middleware);
});

function menu(date: string): DailyMenu {
    return {
        date,
        breakfast: [{ name: 'Complemento', key: 'complement', items: ['Pão'] }],
        lunch: [{ name: 'Prato', key: 'main_dish', items: ['Frango'] }],
        dinner: [{ name: 'Prato', key: 'main_dish', items: ['Sopa'] }]
    };
}

function Preview({
    date,
    time = '22:00',
    upcoming = true
}: {
    date: string;
    time?: string;
    upcoming?: boolean;
}) {
    const now = { date, weekday: 0, time };
    const result = useMenuPreview({ campus: 'Gama', date, now, upcoming });
    const meals = upcomingMenuMeals(result.menus, date, now);
    return (
        <output>
            {result.isLoading
                ? 'Carregando'
                : meals.map((meal) => `${meal.date}:${meal.key}`).join('|')}
        </output>
    );
}

function setup(weeks: Record<string, DailyMenu[]>, date: string, upcoming = true, time = '22:00') {
    const requests: string[] = [];
    middleware = {
        onRequest: ({ request }) => {
            const start = new URL(request.url).searchParams.get('start_date')!;
            requests.push(start);
            return Response.json(weeks[start] ?? []);
        }
    };
    apiClient.use(middleware);
    client = new QueryClient({
        defaultOptions: { queries: { staleTime: Infinity, retry: false } }
    });
    const view = dom.testing.render(
        <QueryClientProvider client={client}>
            <Preview date={date} upcoming={upcoming} time={time} />
        </QueryClientProvider>
    );
    return { view, requests };
}

test('reaproveita a semana atual para as duas refeições de amanhã sem outra requisição', async () => {
    const { view, requests } = setup(
        { '2026-11-09': [menu('2026-11-10'), menu('2026-11-11')] },
        '2026-11-10'
    );
    expect(await view.findByText('2026-11-11:breakfast|2026-11-11:lunch')).toBeDefined();
    expect(requests).toEqual(['2026-11-09']);
});

test('busca a próxima semana quando o domingo já terminou', async () => {
    const { view, requests } = setup(
        { '2026-11-09': [menu('2026-11-15')], '2026-11-16': [menu('2026-11-16')] },
        '2026-11-15'
    );
    expect(await view.findByText('2026-11-16:breakfast|2026-11-16:lunch')).toBeDefined();
    expect(requests).toEqual(['2026-11-09', '2026-11-16']);
});

test('a prévia diária mobile não busca a próxima semana', async () => {
    const { view, requests } = setup({ '2026-11-09': [menu('2026-11-15')] }, '2026-11-15', false);
    await dom.testing.waitFor(() => expect(view.getByRole('status').textContent).toBe(''));
    expect(requests).toEqual(['2026-11-09']);
});

test('ao terminar o jantar muda para café e almoço usando a mesma consulta em cache', async () => {
    const { view, requests } = setup(
        { '2026-11-09': [menu('2026-11-15')], '2026-11-16': [menu('2026-11-16')] },
        '2026-11-15',
        true,
        '18:00'
    );
    expect(await view.findByText('2026-11-15:dinner|2026-11-16:breakfast')).toBeDefined();
    view.rerender(
        <QueryClientProvider client={client}>
            <Preview date="2026-11-15" time="22:00" />
        </QueryClientProvider>
    );
    expect(await view.findByText('2026-11-16:breakfast|2026-11-16:lunch')).toBeDefined();
    expect(requests).toEqual(['2026-11-09', '2026-11-16']);
});
