import { afterEach, beforeAll, describe, expect, mock, spyOn, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { RestaurantSelection } from '#/lib/restaurant-share';
import type { MenuSection } from '#/queries/restaurant';

import { RestaurantShareImage } from '#/components/ru/RestaurantShareImage';
import {
    loadRestaurantSearch,
    restaurantPageHead,
    restaurantSelection,
    restaurantSharePath
} from '#/lib/restaurant-share';
import { restaurantShareResponse } from '#/lib/restaurant-share.server';
import { loadSharedMenu } from '#/queries/restaurant-share';

const selection: RestaurantSelection = { date: '2026-10-19', meal: 'lunch', campus: 'Gama' };
const sections: MenuSection[] = [
    { key: 'salad_1', name: 'Saladas', items: ['Alface', 'Tomate'] },
    { key: 'main_dish', name: 'Prato principal', items: ['Frango ao molho de ervas'] },
    { key: 'main_dish_vegetarian', name: 'Ovolactovegetariano', items: ['Omelete de legumes'] },
    { key: 'main_dish_vegan', name: 'Vegetariano estrito', items: ['Lentilha com abóbora'] },
    { key: 'side_dish', name: 'Guarnição', items: ['Purê de batata'] },
    {
        key: 'accompaniments',
        name: 'Acompanhamentos',
        items: ['Arroz branco', 'Arroz integral', 'Feijão carioca']
    },
    { key: 'dessert', name: 'Sobremesa', items: ['Melancia'] },
    { key: 'drink', name: 'Bebida', items: ['Suco de maracujá'] }
];
const EMPTY = { date: null, meal: null, campus: null };
const handler = ({ request }: { request: Request }) => restaurantShareResponse(request);
const originalSecret = process.env.JWT_SECRET_KEY;
const originalVercel = process.env.VERCEL;
let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, 'fetch'>> | undefined;
afterEach(() => {
    fetchSpy?.mockRestore();
    if (originalSecret === undefined) delete process.env.JWT_SECRET_KEY;
    else process.env.JWT_SECRET_KEY = originalSecret;
    if (originalVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = originalVercel;
});

beforeAll(async () => {
    await Promise.all(
        [400, 700].map(async (weight) => {
            const path = `@fontsource/dm-sans/files/dm-sans-latin-${weight}-normal.woff`;
            const data = await Bun.file(Bun.resolveSync(path, import.meta.dir)).arrayBuffer();
            await mock.module(`${path}?inline`, () => ({
                default: `data:font/woff;base64,${Buffer.from(data).toString('base64')}`
            }));
        })
    );
});

function mockMenu(status = 200, published = true) {
    const originalFetch = globalThis.fetch;
    const mockFetch: typeof globalThis.fetch = Object.assign(
        (
            input: Parameters<typeof globalThis.fetch>[0],
            init?: Parameters<typeof globalThis.fetch>[1]
        ) => {
            if (
                new URL(input instanceof Request ? input.url : String(input)).pathname !==
                '/api/public/restaurant'
            ) {
                return originalFetch(input, init);
            }
            return Promise.resolve(
                new Response(
                    JSON.stringify(published ? [{ date: selection.date, lunch: sections }] : []),
                    { status }
                )
            );
        },
        { preconnect: originalFetch.preconnect }
    );
    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(mockFetch);
}

describe('compartilhamento do cardápio', () => {
    test('prévia encaminha IP assinado sem encaminhar cookies', async () => {
        process.env.JWT_SECRET_KEY = 'chave-de-teste-nao-usar-em-producao';
        process.env.VERCEL = '1';
        mockMenu();
        const request = new Request('https://followw.app/share/ru.png', {
            headers: { 'x-vercel-forwarded-for': '203.0.113.1', cookie: 'refresh_token=secret' }
        });
        await loadSharedMenu(request, selection);
        const init = fetchSpy!.mock.calls.at(-1)![1];
        const headers = new Headers(init?.headers);
        expect(headers.get('x-followw-client')).toEndWith(':203.0.113.1');
        expect(headers.get('x-followw-client-signature')).toHaveLength(64);
        expect(headers.get('cookie')).toBeNull();
    });
    test('o link restaura dia, refeição e campus sem depender dos padrões atuais', () => {
        const url = new URL(restaurantSharePath(selection), 'https://followw.app');
        expect(restaurantSelection(loadRestaurantSearch(url))).toEqual(selection);
    });

    test.each(['2026-02-30', '2026-13-01', 'amanhã', '2026-1-01', '0000-00-00'])(
        'ignora a data inválida %s e filtros desconhecidos',
        (date) => {
            expect(loadRestaurantSearch({ date, meal: 'ceia', campus: '__proto__' })).toEqual(
                EMPTY
            );
        }
    );

    test('o link e a canônica não levam tema', () => {
        expect(restaurantSharePath(selection)).not.toContain('theme');
        expect(loadRestaurantSearch({ theme: 'dark' })).toEqual(EMPTY);
        expect(restaurantPageHead(selection).links[0].href).toBe(
            'https://followw.app/ru?date=2026-10-19&meal=lunch&campus=Gama'
        );
        const markup = renderToStaticMarkup(
            <RestaurantShareImage selection={selection} sections={sections} />
        );
        expect(markup).toContain('followw.app/ru');
    });

    test('os metadados apontam para uma imagem PNG do mesmo dia, refeição e campus', () => {
        const head = restaurantPageHead(selection);
        const image = new URL(
            head.meta.find((tag) => 'property' in tag && tag.property === 'og:image')!.content!
        );
        expect(image.pathname).toBe('/share/ru.png');
        expect(Object.fromEntries(image.searchParams)).toEqual({ ...selection });
        expect(head.meta).toContainEqual({ name: 'twitter:card', content: 'summary_large_image' });
        expect(head.meta).toContainEqual({ title: 'Almoço do RU · 19/10/2026 | Followw' });
        expect(head.links[0].href).toBe(`https://followw.app${restaurantSharePath(selection)}`);
    });

    test('a imagem inclui a marca, data, campus, prato principal e todas as seções', () => {
        const markup = renderToStaticMarkup(
            <RestaurantShareImage selection={selection} sections={sections} />
        );
        for (const text of [
            'Followw',
            'followw.app/ru',
            '19 de outubro',
            'Gama',
            ...sections.flatMap(({ items }) => items)
        ]) {
            expect(markup).toContain(text);
        }
        expect(markup).not.toContain('Seu dia na UnB, mais simples.');
        expect(markup).not.toContain('de 2026');
        expect(markup).toMatch(
            /align-items:center;gap:20px"><span[^>]*>Almoço<\/span><span[^>]*>11:00–14:30<\/span>/
        );
    });

    test('mantém as seções na mesma ordem recebida pelo site e destaca seus rótulos em negrito', () => {
        const markup = renderToStaticMarkup(
            <RestaurantShareImage selection={selection} sections={sections} />
        );
        const labels = [
            ...markup.matchAll(/<span style="[^"]*font-weight:700[^"]*">([^<]+)<\/span>/g)
        ].map((match) => match[1]);
        expect(
            labels.filter((label) =>
                ['Saladas', 'Guarnição', 'Acompanhamentos', 'Sobremesa', 'Bebida'].includes(label)
            )
        ).toEqual(['Saladas', 'Guarnição', 'Acompanhamentos', 'Sobremesa', 'Bebida']);
    });

    test('mostra os tópicos acima dos itens sem bordas na lista de acompanhamentos', () => {
        const accompanying = sections.filter(({ key }) => !key?.startsWith('main_dish'));
        const markup = renderToStaticMarkup(
            <RestaurantShareImage selection={selection} sections={accompanying} />
        );
        expect(markup).toMatch(
            /flex-direction:column[^>]*><span[^>]*>Acompanhamentos<\/span><span[^>]*>Arroz branco/
        );
        expect(markup).not.toContain('border:1px solid');
        expect(markup).not.toContain('align-self:center');
    });

    test.each([
        ['lunch', 'main_dish', 'main_dish_vegetarian', 'main_dish_vegan'],
        ['breakfast', 'complement', 'complement_vegetarian', 'complement_vegan']
    ] as const)(
        'inclui os ícones de ovo e folha nas alternativas de %s',
        (meal, main, vegetarian, vegan) => {
            const alternatives: MenuSection[] = [
                { key: main, name: 'Padrão', items: ['Queijo'] },
                { key: vegetarian, name: 'Ovolactovegetariano', items: ['Omelete'] },
                { key: vegan, name: 'Vegetariano estrito', items: ['Patê de grão-de-bico'] }
            ];
            const markup = renderToStaticMarkup(
                <RestaurantShareImage selection={{ ...selection, meal }} sections={alternatives} />
            );
            const icons = [...markup.matchAll(/src="data:image\/svg\+xml;base64,([^"]+)"/g)].map(
                (match) => atob(match[1])
            );
            expect(icons.some((icon) => icon.includes('lucide-egg'))).toBe(true);
            expect(icons.some((icon) => icon.includes('lucide-leaf'))).toBe(true);
            expect(markup).toContain('alt="Opção ovolactovegetariana"');
            expect(markup).toContain('alt="Opção vegetariana estrita"');
        }
    );

    test('consulta somente o cardápio público na origem da requisição e sem cookies', async () => {
        mockMenu();
        const request = new Request('https://followw.app/share/ru.png', {
            headers: { cookie: 'session=privada' }
        });
        expect(await loadSharedMenu(request, selection)).toEqual(sections);
        const [url, options] = fetchSpy!.mock.calls[0];
        expect(url instanceof URL ? url.href : null).toBe(
            'https://followw.app/api/public/restaurant?campus=Gama&start_date=2026-10-19&end_date=2026-10-19'
        );
        expect(new Headers(options?.headers).get('cookie')).toBeNull();
    });

    test('o endpoint público gera PNG de 1200 por 630 com cache de uma hora e meia', async () => {
        mockMenu();
        const response = await handler({
            request: new Request(
                `https://followw.app${restaurantSharePath(selection, '/share/ru.png')}`
            )
        });
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('image/png');
        expect(response.headers.get('cache-control')).toBe('public, max-age=5400, s-maxage=5400');
        const bytes = new Uint8Array(await response.arrayBuffer());
        expect(Array.from(bytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
        const view = new DataView(bytes.buffer);
        expect([view.getUint32(16), view.getUint32(20)]).toEqual([1200, 630]);
    });

    test('dia sem cardápio mantém a identidade e informa ausência de publicação', async () => {
        mockMenu(200, false);
        const empty = await loadSharedMenu(
            new Request('https://followw.app/share/ru.png'),
            selection
        );
        expect(empty).toEqual([]);
        const markup = renderToStaticMarkup(
            <RestaurantShareImage selection={selection} sections={empty} />
        );
        expect(markup).toContain('Cardápio não publicado');
        expect(markup).toContain('Followw');
    });

    test('prévia de cardápio não publicado não é cacheada', async () => {
        mockMenu(200, false);
        const response = await handler({
            request: new Request(
                `https://followw.app${restaurantSharePath(selection, '/share/ru.png')}`
            )
        });
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('no-store');
    });

    test('falha da origem não é cacheada como cardápio vazio', async () => {
        mockMenu(503);
        const response = await handler({
            request: new Request('https://followw.app/share/ru.png')
        });
        expect(response.status).toBe(503);
        expect(response.headers.get('cache-control')).toBe('no-store');
    });
});
