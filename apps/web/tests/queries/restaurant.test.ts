import type { Middleware } from 'openapi-fetch';

import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { apiClient } from '#/queries/client.ts';
import { campusOf, menuQueryOptions, prefetchWeekMenus } from '#/queries/restaurant.ts';

const user = { unity: 'FCTE' };
const date = '2026-09-26';
const paramsOf = (options: ReturnType<typeof menuQueryOptions>) => options.queryKey[2];

describe('campusOf', () => {
    test('mapeia a unidade para o campus', () => {
        expect(campusOf('FCTE')).toBe('Gama');
        expect(campusOf('FCTS')).toBe('Ceilandia');
        expect(campusOf('FUP')).toBe('Planaltina');
    });

    test('cai no Darcy para outras unidades ou sem unidade', () => {
        expect(campusOf('FT')).toBe('Darcy');
        expect(campusOf(null)).toBe('Darcy');
        expect(campusOf()).toBe('Darcy');
    });
});

const week = { start_date: '2026-09-21', end_date: '2026-09-27' };

describe('menuQueryOptions', () => {
    test('consulta a semana do dia pela rota pública sem usuário', () => {
        expect(menuQueryOptions({ date }).queryKey).toEqual([
            'get',
            '/public/restaurant',
            { params: { query: { campus: 'Darcy', ...week } } }
        ]);
    });

    test('usa o campus do usuário logado quando nenhum é especificado', () => {
        expect(paramsOf(menuQueryOptions({ date, user }))).toEqual({
            params: { query: { campus: 'Gama', ...week } }
        });
    });

    test('prioriza o campus explícito', () => {
        expect(paramsOf(menuQueryOptions({ campus: 'Fazenda', date, user }))).toEqual({
            params: { query: { campus: 'Fazenda', ...week } }
        });
    });

    test('usa o Darcy sem usuário', () => {
        expect(paramsOf(menuQueryOptions({ date, user: null }))).toEqual({
            params: { query: { campus: 'Darcy', ...week } }
        });
    });

    test('compartilha o cache entre os dias da semana e separa por campus e semana', () => {
        const current = menuQueryOptions({ campus: 'Darcy', date }).queryKey;
        expect(menuQueryOptions({ campus: 'Darcy', date: '2026-09-22' }).queryKey).toEqual(current);
        expect(menuQueryOptions({ campus: 'Gama', date }).queryKey).not.toEqual(current);
        expect(menuQueryOptions({ campus: 'Darcy', date: '2026-09-28' }).queryKey).not.toEqual(
            current
        );
    });

    test('inclui o domingo na semana que termina nele', () => {
        expect(paramsOf(menuQueryOptions({ date: '2026-09-27' }))).toEqual({
            params: { query: { campus: 'Darcy', ...week } }
        });
    });

    test('seleciona só o cardápio do dia', () => {
        const days = [
            { date: '2026-09-25', lunch: [] },
            { date: '2026-09-26', lunch: [] }
        ];
        expect(menuQueryOptions({ date }).select(days)).toEqual([days[1]]);
    });
});

describe('prefetchWeekMenus', () => {
    test('busca a semana numa requisição só', async () => {
        const client = new QueryClient();
        const monday = { date: '2026-10-05', lunch: [] };
        const requests: URL[] = [];
        const middleware: Middleware = {
            onRequest: ({ request }) => {
                requests.push(new URL(request.url));
                return Response.json([monday]);
            }
        };
        apiClient.use(middleware);

        await prefetchWeekMenus(client, 'Gama', '2026-10-07');
        // mesmo vencido, o cardápio salvo da semana basta para o offline
        await prefetchWeekMenus(client, 'Gama', '2026-10-08');
        apiClient.eject(middleware);

        expect(requests).toHaveLength(1);
        expect(requests[0].searchParams.get('start_date')).toBe('2026-10-05');
        expect(requests[0].searchParams.get('end_date')).toBe('2026-10-11');
        const saved: unknown = client.getQueryData(
            menuQueryOptions({ campus: 'Gama', date: monday.date }).queryKey
        );
        expect(saved).toEqual([monday]);
    });
});
