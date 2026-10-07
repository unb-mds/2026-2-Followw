import { describe, expect, test } from 'bun:test';

import { Route as FallbackRoute } from '#/routes/$';
import { Route as RootRoute } from '#/routes/__root';
import { Route as HomeRoute } from '#/routes/_app/index';
import { Route as ProfileRoute } from '#/routes/_app/perfil';
import { Route as RestaurantRoute } from '#/routes/_app/ru';
import { Route as ClassroomsRoute } from '#/routes/_app/turmas';
import { Route as ClassroomRoute } from '#/routes/_app/turmas_.$id';
import { Route as LoginRoute } from '#/routes/login';

import vercel from '../../../../vercel.json';

const publicRoutes = [
    {
        route: HomeRoute,
        url: 'https://followw.app/',
        title: 'Followw — SIGAA UnB e cardápio do RU'
    },
    { route: RestaurantRoute, url: 'https://followw.app/ru', title: 'Cardápio do RU UnB | Followw' }
];

describe('indexação das páginas', () => {
    test.each(publicRoutes)(
        '$url possui metadados e canonical próprios',
        async ({ route, url, title }) => {
            const head = await route.options.head({});
            expect(head.links).toEqual([{ rel: 'canonical', href: url }]);
            expect(head.meta).toContainEqual({ title });
            expect(head.meta).toContainEqual({ name: 'robots', content: 'index, follow' });
            expect(head.meta).toContainEqual({ property: 'og:url', content: url });
            const description = head.meta.find((tag) => tag.name === 'description').content;
            expect(description.length).toBeGreaterThan(50);
            expect(head.meta).toContainEqual({ property: 'og:description', content: description });
        }
    );

    test('a página inicial identifica o nome do site em dados estruturados', async () => {
        const head = await HomeRoute.options.head({});
        const script = head.scripts.find((item) => item.type === 'application/ld+json');
        expect(JSON.parse(script.children)).toEqual({
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'Followw',
            alternateName: 'Followw UnB',
            url: 'https://followw.app/'
        });
    });

    test.each([LoginRoute, ProfileRoute, ClassroomsRoute, ClassroomRoute])(
        'telas não públicas herdam noindex sem canonical público',
        async (route) => {
            const rootHead = await RootRoute.options.head({});
            const head = await route.options.head?.({});
            const meta = [...rootHead.meta, ...(head?.meta ?? [])];
            expect(meta.findLast((tag) => tag.name === 'robots').content).toBe('noindex, follow');
            expect(
                [...(rootHead.links ?? []), ...(head?.links ?? [])].some(
                    (link) => link.rel === 'canonical'
                )
            ).toBe(false);
        }
    );

    test.each([
        [LoginRoute, 'Entrar | Followw'],
        [ProfileRoute, 'Perfil | Followw'],
        [ClassroomsRoute, 'Minhas Turmas | Followw'],
        [ClassroomRoute, 'Turma | Followw']
    ])('telas não públicas têm título próprio', async (route, title) => {
        const head = await route.options.head({});
        expect(head.meta).toContainEqual({ title });
    });

    test('a turma usa o nome da disciplina no título quando conhecida', async () => {
        const head = await ClassroomRoute.options.head({
            loaderData: { subjectName: 'Cálculo 1' }
        });
        expect(head.meta).toContainEqual({ title: 'Cálculo 1 | Followw' });
    });

    test('URLs inexistentes continuam redirecionando para a inicial', () => {
        let error;
        try {
            FallbackRoute.options.beforeLoad();
        } catch (caught) {
            error = caught;
        }
        expect(error).toMatchObject({ options: { to: '/' } });
    });

    test('sitemap contém apenas as páginas públicas com os mesmos canonicals', async () => {
        const sitemap = await Bun.file(new URL('../../public/sitemap.xml', import.meta.url)).text();
        const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
        expect(urls).toEqual(publicRoutes.map(({ url }) => url));
        const robots = await Bun.file(new URL('../../public/robots.txt', import.meta.url)).text();
        expect(robots).toContain('Sitemap: https://followw.app/sitemap.xml');
        expect(robots).not.toMatch(/Disallow: \/(?:assets|login|perfil|turmas)/);
    });

    test('www redireciona permanentemente preservando o caminho sem afetar api.followw.app', () => {
        expect(vercel.redirects).toContainEqual({
            source: '/:path*',
            has: [{ type: 'host', value: 'www.followw.app' }],
            destination: 'https://followw.app/:path*',
            permanent: true
        });
    });
});
