import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    RouterProvider,
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter
} from '@tanstack/react-router';
import { describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { renderToStaticMarkup } from 'react-dom/server';

import { meQueryOptions } from '#/queries/me';
import { Route as LoginRoute } from '#/routes/login';
import { Route as PrivacyRoute } from '#/routes/privacidade';

async function renderPage(path: string, user: { name: string } | null = null) {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    client.setQueryData<{ name: string } | null>(meQueryOptions.queryKey, user);
    const root = createRootRoute();
    const privacy = createRoute({
        getParentRoute: () => root,
        path: '/privacidade',
        component: PrivacyRoute.options.component
    });
    const login = createRoute({
        getParentRoute: () => root,
        path: '/login',
        component: LoginRoute.options.component
    });
    const router = createRouter({
        routeTree: root.addChildren([privacy, login]),
        history: createMemoryHistory({ initialEntries: [path] })
    });
    await router.load();
    try {
        return renderToStaticMarkup(
            <QueryClientProvider client={client}>
                <RouterProvider router={router} />
            </QueryClientProvider>
        );
    } finally {
        client.clear();
    }
}

describe('privacidade e termos', () => {
    test.each([null, { name: 'Estudante' }])(
        'permite consultar a página sem exigir ou redirecionar a sessão %p',
        async (user) => {
            expect(PrivacyRoute.options.loader).toBeUndefined();
            expect(PrivacyRoute.options.beforeLoad).toBeUndefined();
            const markup = await renderPage('/privacidade', user);
            expect(markup).toContain('Política de privacidade');
            expect(markup).toContain('Termos de serviço');
            expect(markup).toContain('href="/login"');
        }
    );

    test('explica retenção, credenciais, análise de uso e exclusão sem prometer bloqueio de novas coletas', async () => {
        const markup = await renderPage('/privacidade');
        expect(markup).toContain('prazo automático de exclusão');
        expect(markup).toContain('14 dias');
        expect(markup).toContain('cookies cifrados');
        expect(markup).toContain('QStash (Upstash)');
        expect(markup).toContain('PostHog');
        expect(markup).toContain('gravação de sessões');
        expect(markup).toContain('href="mailto:removal@followw.app"');
        expect(markup).toContain('não impede novas coletas');
        expect(markup).toContain('stalking');
        expect(markup).toContain('automações são permitidos');
    });

    test('rodapé do login oferece um único link para privacidade e termos de serviço', async () => {
        const browser = new Window();
        try {
            browser.document.body.innerHTML = await renderPage('/login');
            expect(browser.document.querySelector('footer')?.textContent).toBe(
                'Ao entrar, você concorda com nossa política de privacidade e nossos termos de serviço.'
            );
            const links = [...browser.document.querySelectorAll('footer a')].map((link) => ({
                text: link.textContent,
                href: link.getAttribute('href')
            }));
            expect(links).toEqual([
                {
                    text: 'política de privacidade e nossos termos de serviço',
                    href: '/privacidade'
                }
            ]);
        } finally {
            await browser.happyDOM.abort();
        }
    });
});
