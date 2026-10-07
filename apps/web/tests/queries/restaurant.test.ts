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

describe('menuQueryOptions', () => {
    test('consulta o cardápio pela rota pública sem usuário', () => {
        expect(menuQueryOptions({ date }).queryKey).toEqual([
            'get',
            '/public/restaurant',
            { params: { query: { campus: 'Darcy', date } } }
        ]);
    });

    test('usa o campus do usuário logado quando nenhum é especificado', () => {
        expect(paramsOf(menuQueryOptions({ date, user }))).toEqual({
            params: { query: { campus: 'Gama', date } }
        });
    });

    test('prioriza o campus explícito', () => {
        expect(paramsOf(menuQueryOptions({ campus: 'Fazenda', date, user }))).toEqual({
            params: { query: { campus: 'Fazenda', date } }
        });
    });

    test('usa o Darcy sem usuário', () => {
        expect(paramsOf(menuQueryOptions({ date, user: null }))).toEqual({
            params: { query: { campus: 'Darcy', date } }
        });
    });

    test('separa o cache por dia e campus selecionados', () => {
        const current = menuQueryOptions({ campus: 'Darcy', date }).queryKey;
        expect(menuQueryOptions({ campus: 'Gama', date }).queryKey).not.toEqual(current);
        expect(menuQueryOptions({ campus: 'Darcy', date: '2026-09-27' }).queryKey).not.toEqual(
            current
        );
    });
});

describe('prefetchWeekMenus', () => {
    test('busca a semana numa requisição e grava o cardápio de cada dia', async () => {
        const client = new QueryClient();
        const monday = { date: '2026-10-05', lunch: [] };
        const tuesday = { date: '2026-10-06', lunch: [] };
        const tuesdayKey = menuQueryOptions({ campus: 'Gama', date: tuesday.date }).queryKey;
        client.setQueryData(tuesdayKey, [
            { date: tuesday.date, lunch: [{ name: 'Velho', items: [] }] }
        ]);
        const requests: URL[] = [];
        const middleware: Middleware = {
            onRequest: ({ request }) => {
                requests.push(new URL(request.url));
                return Response.json([monday, tuesday]);
            }
        };
        apiClient.use(middleware);

        await prefetchWeekMenus(client, 'Gama', '2026-10-07');
        apiClient.eject(middleware);

        expect(requests).toHaveLength(1);
        expect(requests[0].searchParams.get('start_date')).toBe('2026-10-05');
        expect(requests[0].searchParams.get('end_date')).toBe('2026-10-10');
        const cached = (day: string): unknown =>
            client.getQueryData(menuQueryOptions({ campus: 'Gama', date: day }).queryKey);
        expect(cached(monday.date)).toEqual([monday]);
        // o dado da semana é o mais novo: substitui o que estava salvo
        expect(cached(tuesday.date)).toEqual([tuesday]);
        // a query da faixa não fica no cache (nem vai para o persister)
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(
            client.getQueryCache().findAll({ queryKey: ['get', '/public/restaurant'] })
        ).toHaveLength(2);
    });
});
